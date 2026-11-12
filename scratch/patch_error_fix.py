path = 'C:/project/ocrPlatform/src/modules/customer/jobs/JobsPage.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update catch block in handleUploadSubmit
old_catch = """      } catch (err: any) {
        console.error('OCR process error:', err);
        setUploadError(err.message || 'Lỗi khi kết nối hoặc xử lý bóc tách tài liệu với VLM.');
      }"""

new_catch = """      } catch (err: any) {
        console.error('OCR process error:', err);
        const errMsg =
          typeof err?.message === 'string'
            ? err.message
            : typeof err?.message?.message === 'string'
            ? err.message.message
            : typeof err?.detail === 'string'
            ? err.detail
            : typeof err?.detail?.message === 'string'
            ? err.detail.message
            : 'Lỗi khi kết nối hoặc xử lý bóc tách tài liệu với VLM.';
        setUploadError(String(errMsg));
      }"""

assert old_catch in content, "old_catch not found"
content = content.replace(old_catch, new_catch)

# 2. Update uploadError render block
old_render = """          {uploadError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex flex-col gap-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{uploadError}</span>
              </div>
              {uploadError.toLowerCase().includes('xác thực') && ("""

new_render = """          {uploadError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex flex-col gap-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                <span className="leading-relaxed">
                  {typeof uploadError === 'string' ? uploadError : JSON.stringify(uploadError)}
                </span>
              </div>
              {String(uploadError).toLowerCase().includes('xác thực') && ("""

assert old_render in content, "old_render not found"
content = content.replace(old_render, new_render)

# 3. Also filter matchingLic so we don't send mock license IDs like 'lic-...'
old_lic = """        const matchingLic = customerLicenses.find((l) => l.serviceId === srv.id) || customerLicenses[0];
        if (matchingLic) {
          formData.append('license_id', matchingLic.id);
        }"""

new_lic = """        const realLicenses = customerLicenses.filter((l) => l.id && !l.id.startsWith('lic-'));
        const matchingLic = realLicenses.find((l) => l.serviceId === srv.id) || realLicenses[0];
        if (matchingLic) {
          formData.append('license_id', matchingLic.id);
        }"""

assert old_lic in content, "old_lic not found"
content = content.replace(old_lic, new_lic)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("JobsPage error handling updated successfully")
