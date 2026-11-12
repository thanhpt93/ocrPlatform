import sys
sys.path.insert(0, 'C:/project/ocrPlatform/backend')
import sqlite3
from app.core.security import verify_password

conn = sqlite3.connect('C:/project/ocrPlatform/ocrplatform.db')
cur = conn.cursor()
cur.execute('SELECT email, hashed_password FROM users WHERE email=?', ('thanhpt93.hd@gmail.com',))
row = cur.fetchone()
if row:
    email, h = row
    print("Found user:", email)
    candidates = ['123456', '12345678', 'Password123', 'CustomerPass123', 'AdminPass123', 'Thanh123', 'thanhpt93', 'Password123!', '12345678a@', '123456aA@']
    for c in candidates:
        try:
            if verify_password(c, h):
                print("MATCH FOUND:", c)
                break
        except Exception as e:
            print("Error verifying:", e)
    else:
        print("No match in candidates")
