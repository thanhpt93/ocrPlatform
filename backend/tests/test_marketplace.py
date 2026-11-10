def test_public_service_listing(client):
    res = client.get("/api/v1/ocr-services")
    assert res.status_code == 200
    services = res.json()
    assert len(services) >= 1
    # Check that ALL returned services are published
    for s in services:
        assert s["status"] == "published"
        assert s["code"] != "srv-draft-1"

def test_published_service_detail(client):
    services = client.get("/api/v1/ocr-services").json()
    pub_service = services[0]

    res = client.get(f"/api/v1/ocr-services/{pub_service['id']}")
    assert res.status_code == 200
    detail = res.json()
    assert detail["id"] == pub_service["id"]
    assert "document_types" in detail
    assert "supported_doc_type_ids" in detail

def test_service_packages_endpoint(client):
    services = client.get("/api/v1/ocr-services").json()
    pub_service = services[0]

    res = client.get(f"/api/v1/ocr-services/{pub_service['id']}/packages")
    assert res.status_code == 200
    packages = res.json()
    assert len(packages) >= 1
    pkg = packages[0]
    assert "current_version" in pkg
    assert pkg["current_version"]["quota_type"] == "Page"

def test_document_types_listing(client):
    res = client.get("/api/v1/document-types")
    assert res.status_code == 200
    doc_types = res.json()
    assert len(doc_types) >= 1
    assert any(dt["code"] == "dt-test-pdf" for dt in doc_types)
