def test_admin_create_package_with_initial_version(client, admin_token):
    services = client.get("/api/v1/ocr-services").json()
    service_id = services[0]["id"]

    res = client.post(
        "/api/v1/admin/packages",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "code": "pkg-invoice-flow",
            "name": "Invoice Flow Standard",
            "tier": "Professional",
            "service_id": service_id,
            "status": "active",
            "initial_version": {
                "price": 99.0,
                "currency": "USD",
                "quota_type": "Document",
                "quota_amount": 2500,
                "duration": "monthly",
                "billing_type": "one_time",
                "api_access": True,
                "features": ["2500 invoices", "Webhooks"]
            }
        }
    )
    assert res.status_code == 201
    pkg = res.json()
    assert pkg["code"] == "pkg-invoice-flow"
    assert pkg["current_version"]["version_number"] == 1
    assert pkg["current_version"]["quota_type"] == "Document"
    assert pkg["current_version"]["quota_amount"] == 2500

def test_package_versioning_and_historical_preservation(client, admin_token):
    services = client.get("/api/v1/ocr-services").json()
    service_id = services[0]["id"]

    # 1. Create Package
    create_res = client.post(
        "/api/v1/admin/packages",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "code": "pkg-versioned-demo",
            "name": "Versioned Demo Service",
            "tier": "Starter",
            "service_id": service_id,
            "status": "active",
            "initial_version": {
                "price": 50.0,
                "currency": "USD",
                "quota_type": "Page",
                "quota_amount": 1000,
                "duration": "monthly",
                "features": ["Version 1 features"]
            }
        }
    )
    assert create_res.status_code == 201
    pkg_id = create_res.json()["id"]

    # 2. Add Version 2 with new price and quota
    v2_res = client.post(
        f"/api/v1/admin/packages/{pkg_id}/versions",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "price": 65.0,
            "currency": "USD",
            "quota_type": "Page",
            "quota_amount": 1500,
            "duration": "monthly",
            "billing_type": "one_time",
            "api_access": True,
            "features": ["Version 2 improved features"]
        }
    )
    assert v2_res.status_code == 201
    v2_data = v2_res.json()
    assert v2_data["version_number"] == 2
    assert v2_data["is_current"] is True

    # 3. Retrieve package: verify both Version 1 and Version 2 exist and Version 1 is preserved
    get_res = client.get(f"/api/v1/packages/{pkg_id}")
    assert get_res.status_code == 200
    pkg_data = get_res.json()
    assert len(pkg_data["versions"]) == 2
    v1 = next(v for v in pkg_data["versions"] if v["version_number"] == 1)
    v2 = next(v for v in pkg_data["versions"] if v["version_number"] == 2)
    assert v1["price"] == 50.0
    assert v1["quota_amount"] == 1000
    assert v1["is_current"] is False

    assert v2["price"] == 65.0
    assert v2["quota_amount"] == 1500
    assert v2["is_current"] is True
