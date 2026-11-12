path = 'C:/project/ocrPlatform/backend/app/modules/ocr_engine/service.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old_block = """        elif license_id:
            lic = db.query(License).filter(License.id == license_id).first()
            if not lic:
                raise EntityNotFoundException("License", license_id)
            if user and lic.user_id != user.id:
                raise ForbiddenException("This license does not belong to your account")
        elif user:
            # Pick first active license of the user
            lic = db.query(License).filter(
                License.user_id == user.id,
                License.status == LicenseStatus.ACTIVE
            ).first()"""

new_block = """        elif license_id:
            lic = db.query(License).filter(License.id == license_id).first()
            if lic and user and lic.user_id != user.id:
                lic = None
            if not lic and user:
                lic = db.query(License).filter(
                    License.user_id == user.id,
                    License.status == LicenseStatus.ACTIVE
                ).first()
            if not lic:
                raise EntityNotFoundException("License", license_id)
        elif user:
            # Pick first active license of the user
            lic = db.query(License).filter(
                License.user_id == user.id,
                License.status == LicenseStatus.ACTIVE
            ).first()"""

assert old_block in content, "old_block not found"
content = content.replace(old_block, new_block)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("service.py updated successfully")
