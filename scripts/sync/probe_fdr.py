"""FinanceDataReader 종목 리스트 동작 검증."""
import sys
sys.stdout.reconfigure(encoding="utf-8")

import FinanceDataReader as fdr
print("FDR version:", fdr.__version__)

print("\n--- StockListing('KOSPI') ---")
df = fdr.StockListing("KOSPI")
print(f"  shape: {df.shape}")
print(f"  columns: {list(df.columns)}")
print(df.head(3))

print("\n--- StockListing('KOSDAQ') ---")
df = fdr.StockListing("KOSDAQ")
print(f"  shape: {df.shape}")
print(f"  columns: {list(df.columns)}")
print(df.head(3))
