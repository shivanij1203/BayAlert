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

    # convert readings table to a hypertable if it isn't already
    with engine.connect() as conn:
        conn.execute(
            text("""
                SELECT create_hypertable(
                    'readings', 'recorded_at',
                    if_not_exists => TRUE,
                    migrate_data => TRUE
                )
            """)
        )
        conn.commit()
