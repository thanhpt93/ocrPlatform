import sqlite3

conn = sqlite3.connect('C:/project/ocrPlatform/ocrplatform.db')
cur = conn.cursor()
cur.execute("SELECT id, job_id, amount, created_at FROM usage_records")
print("Usage Records:", cur.fetchall())
cur.execute("SELECT id, delta, balance_after, entry_type, reference_id, created_at FROM usage_ledger")
print("Usage Ledger:", cur.fetchall())
