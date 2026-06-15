from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import json

db = SQLAlchemy()


class QueryHistory(db.Model):
    __tablename__ = 'query_history'

    id = db.Column(db.Integer, primary_key=True)
    brno = db.Column(db.String(10), nullable=False, index=True)
    brno_formatted = db.Column(db.String(13), nullable=False)
    company_name = db.Column(db.String(255), nullable=True)
    query_date = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # API 결과 (JSON)
    bizno_result = db.Column(db.JSON, nullable=True)
    gov_result = db.Column(db.JSON, nullable=True)
    crawl_result = db.Column(db.JSON, nullable=True)
    ftc_result = db.Column(db.JSON, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'brno': self.brno,
            'brno_formatted': self.brno_formatted,
            'company_name': self.company_name,
            'query_date': self.query_date.isoformat(),
            'api': {
                'bizno': self.bizno_result,
                'gov': self.gov_result,
            },
            'crawl': self.crawl_result,
            'ftc': self.ftc_result,
        }

    @staticmethod
    def get_recent_by_brno(brno, days=90):
        """3개월(90일) 이내의 조회 기록 조회"""
        from datetime import timedelta
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        return QueryHistory.query.filter(
            QueryHistory.brno == brno,
            QueryHistory.query_date >= cutoff_date
        ).order_by(QueryHistory.query_date.desc()).first()

    @staticmethod
    def delete_old_records(days=90):
        """3개월 경과 기록 삭제"""
        from datetime import timedelta
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        deleted = QueryHistory.query.filter(
            QueryHistory.query_date < cutoff_date
        ).delete()
        db.session.commit()
        return deleted


class FtcBrandInfo(db.Model):
    __tablename__ = 'ftc_brand_info'

    id = db.Column(db.Integer, primary_key=True)
    jng_biz_crtra_yr = db.Column(db.Integer, nullable=False, index=True)
    brand_mnno = db.Column(db.String(50), nullable=False, index=True)
    jng_hdqrtrs_mnno = db.Column(db.String(50), nullable=True)
    brno = db.Column(db.String(10), nullable=True, index=True)
    crno = db.Column(db.String(20), nullable=True)
    jng_hdqrtrs_reprсv_nm = db.Column(db.String(100), nullable=True)
    brand_nm = db.Column(db.String(255), nullable=True)
    induty_lclas_nm = db.Column(db.String(100), nullable=True)
    induty_mlsfc_nm = db.Column(db.String(100), nullable=True)
    majr_gds_nm = db.Column(db.String(255), nullable=True)
    jng_biz_strt_date = db.Column(db.String(8), nullable=True)
    corp_nm = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        db.UniqueConstraint('brand_mnno', 'jng_biz_crtra_yr', name='uq_brand_mnno_year'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'jng_biz_crtra_yr': self.jng_biz_crtra_yr,
            'brand_mnno': self.brand_mnno,
            'jng_hdqrtrs_mnno': self.jng_hdqrtrs_mnno,
            'brno': self.brno,
            'crno': self.crno,
            'jng_hdqrtrs_rprсv_nm': self.jng_hdqrtrs_reprсv_nm,
            'brand_nm': self.brand_nm,
            'induty_lclas_nm': self.induty_lclas_nm,
            'induty_mlsfc_nm': self.induty_mlsfc_nm,
            'majr_gds_nm': self.majr_gds_nm,
            'jng_biz_strt_date': self.jng_biz_strt_date,
            'corp_nm': self.corp_nm,
        }

    @staticmethod
    def get_by_brand_mnno(brand_mnno):
        """브랜드관리번호로 조회"""
        return FtcBrandInfo.query.filter_by(brand_mnno=brand_mnno).all()

    @staticmethod
    def get_by_brno(brno):
        """사업자번호로 조회"""
        return FtcBrandInfo.query.filter_by(brno=brno).all()


class FtcBrand(db.Model):
    __tablename__ = 'ftc_brand'

    id = db.Column(db.Integer, primary_key=True)
    brno = db.Column(db.String(10), nullable=False, index=True)
    corp_nm = db.Column(db.String(255), nullable=True)
    brand_nm = db.Column(db.String(255), nullable=True)
    jng_ifrmp_sn = db.Column(db.String(50), nullable=True)
    jng_ifrmp_rgsno = db.Column(db.String(50), nullable=True)
    year = db.Column(db.Integer, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        db.UniqueConstraint('brno', 'year', 'jng_ifrmp_rgsno', name='uq_brno_year_rgsno'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'brno': self.brno,
            'corp_nm': self.corp_nm,
            'brand_nm': self.brand_nm,
            'jng_ifrmp_sn': self.jng_ifrmp_sn,
            'jng_ifrmp_rgsno': self.jng_ifrmp_rgsno,
            'year': self.year,
        }

    @staticmethod
    def get_by_brno(brno):
        """사업자번호로 모든 가맹정보 조회"""
        return FtcBrand.query.filter_by(brno=brno).all()

    @staticmethod
    def get_by_brno_and_year(brno, year):
        """사업자번호와 년도로 조회"""
        return FtcBrand.query.filter_by(brno=brno, year=year).all()
