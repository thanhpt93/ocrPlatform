import sqlite3

conn = sqlite3.connect('C:/project/ocrPlatform/ocrplatform.db')
cur = conn.cursor()
cur.execute('SELECT email, full_name, hashed_password FROM users WHERE email=?', ('thanhpt93.hd@gmail.com',))
print(cur.fetchall())
