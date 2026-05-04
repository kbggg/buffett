"""pykrx 데이터 가용 날짜 프로빙."""
import sys
from datetime import datetime
sys.stdout.reconfigure(encoding="utf-8")

from pykrx import stock

print("system today:", datetime.now())
d = "20240102"
print(f"\n--- get_market_ticker_list({d}, KOSPI) ---")
try:
    t = stock.get_market_ticker_list(d, market="KOSPI")
    print(f"  count: {len(t)}; first 3: {t[:3]}")
except Exception as e:
    print(f"  ERROR: {e}")

print(f"\n--- get_market_cap_by_ticker({d}, KOSPI) ---")
try:
    df = stock.get_market_cap_by_ticker(d, market="KOSPI")
    print(f"  shape: {df.shape}; head:\n{df.head()}")
except Exception as e:
    print(f"  ERROR: {e}")

print(f"\n--- get_market_ohlcv_by_ticker({d}, KOSPI) ---")
try:
    df = stock.get_market_ohlcv_by_ticker(d, market="KOSPI")
    print(f"  shape: {df.shape}; head:\n{df.head()}")
except Exception as e:
    print(f"  ERROR: {e}")

print(f"\n--- single ticker name lookup (sanity) ---")
print(f"  005930 name: {stock.get_market_ticker_name('005930')}")

print(f"\n--- pykrx version ---")
import pykrx
print(f"  pykrx: {pykrx.__version__ if hasattr(pykrx, '__version__') else 'unknown'}")
