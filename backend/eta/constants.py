"""ETA / EtaMiddleware constants."""
from __future__ import annotations

DEFAULT_TEST_BASE_URL = "https://testserver.misrapp.com"
DEFAULT_PROD_BASE_URL = "https://eta.misrapp.com/api"

DOC_TYPE_SALES_RECEIPT = 3
DOC_TYPE_RETURN_RECEIPT = 4

PAYMENT_CASH = 0
PAYMENT_VISA = 1
PAYMENT_MIXED = 2

CUSTOMER_PERSON = 0
CUSTOMER_BUSINESS = 1
CUSTOMER_FOREIGN = 2

DEFAULT_WALK_IN: dict[str, str] = {
    "CustomerName": "Walk-in Customer",
    "CustomerCode": "WALKIN",
    "CustomerTaxId": "",
    "CustomerPhone": "",
    "CustomerCountryCode": "EG",
    "CustomerGovernate": "Cairo",
    "CustomerCity": "Cairo",
    "CustomerStreet": "N/A",
    "CustomerBuilding": "1",
}
