from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create tables and enable TimescaleDB hypertable."""
    # enable timescaledb extension
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb"))
        conn.commit()

    Base.metadata.create_all(bind=engine)

    # convert time-series tables to hypertables if they aren't already
    with engine.connect() as conn:
        for table in ("readings", "environmental_readings"):
            conn.execute(
                text(
                    f"""
                    SELECT create_hypertable(
                        '{table}', 'recorded_at',
                        if_not_exists => TRUE,
                        migrate_data => TRUE
                    )
                    """
                )
            )
        conn.commit()

    # idempotent column additions for the operator-workflow fields on alerts
    with engine.connect() as conn:
        for column_ddl in (
            "ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ",
            "ADD COLUMN IF NOT EXISTS acknowledged_by VARCHAR(120)",
            "ADD COLUMN IF NOT EXISTS notes VARCHAR(1000)",
            "ADD COLUMN IF NOT EXISTS feedback VARCHAR(32) NOT NULL DEFAULT 'unknown'",
            "ADD COLUMN IF NOT EXISTS last_delivered_at TIMESTAMPTZ",
            "ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ",
        ):
            conn.execute(text(f"ALTER TABLE alerts {column_ddl}"))
        conn.commit()
