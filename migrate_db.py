#!/usr/bin/env python
"""
마이그레이션 스크립트: 새로운 컬럼 추가
"""

from app import app, db
from models import QueryHistory
import sqlalchemy as sa

def migrate():
    """데이터베이스 마이그레이션"""
    with app.app_context():
        # 테이블 정보 조회
        inspector = sa.inspect(db.engine)
        columns = [col['name'] for col in inspector.get_columns('query_history')]

        # 새로운 컬럼 추가 (이미 존재하면 스킵)
        if 'mct_ry_cd_result' not in columns:
            with db.engine.begin() as conn:
                conn.execute(sa.text(
                    "ALTER TABLE query_history ADD COLUMN mct_ry_cd_result JSON"
                ))
            print("✓ mct_ry_cd_result 컬럼 추가됨")
        else:
            print("✓ mct_ry_cd_result 컬럼은 이미 존재합니다")

        if 'hpsn_result' not in columns:
            with db.engine.begin() as conn:
                conn.execute(sa.text(
                    "ALTER TABLE query_history ADD COLUMN hpsn_result JSON"
                ))
            print("✓ hpsn_result 컬럼 추가됨")
        else:
            print("✓ hpsn_result 컬럼은 이미 존재합니다")

        print("\n마이그레이션 완료!")

if __name__ == "__main__":
    migrate()
