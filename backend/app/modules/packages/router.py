from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.common.schemas.packages import PackageResponse, CreditRateResponse
from app.modules.packages.service import PackageService

router = APIRouter(tags=["Packages"])

@router.get("/packages/{package_id}", response_model=PackageResponse)
def get_package_detail(package_id: str, db: Session = Depends(get_db)):
    return PackageService.get_package_by_id(db, package_id)

@router.get("/credit-rates", response_model=List[CreditRateResponse])
def get_credit_rates(db: Session = Depends(get_db)):
    return PackageService.get_credit_rates(db)
