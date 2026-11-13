from unittest.mock import patch


def test_admin_endpoints_require_admin_role(client, customer_one_token):
    headers = {"Authorization": f"Bearer {customer_one_token}"}
    endpoints = [
        ("GET", "/api/v1/admin/dashboard"),
        ("GET", "/api/v1/admin/customers/overview"),
        ("GET", "/api/v1/admin/subscriptions"),
        ("GET", "/api/v1/admin/orders"),
        ("GET", "/api/v1/admin/payments"),
        ("GET", "/api/v1/admin/licenses/overview"),
        ("GET", "/api/v1/admin/usage-records"),
        ("GET", "/api/v1/admin/monitoring"),
        ("GET", "/api/v1/admin/operators"),
        ("GET", "/api/v1/admin/audit-logs"),
        ("GET", "/api/v1/admin/system/config"),
    ]
    for method, path in endpoints:
        res = client.request(method, path, headers=headers)
        assert res.status_code == 403, f"Expected 403 for {method} {path}, got {res.status_code}"


def test_admin_real_data_aggregation_after_purchase_and_usage(
    client, db, admin_token, customer_one, customer_one_token
):
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    cust_headers = {"Authorization": f"Bearer {customer_one_token}"}

    # 1. Customer purchases pkg-test-1 ($29.00, 1000 pages)
    pkgs = client.get("/api/v1/packages").json()
    pv_id = pkgs[0]["current_version"]["id"]

    order_res = client.post(
        "/api/v1/orders",
        headers=cust_headers,
        json={"package_version_id": pv_id},
    )
    assert order_res.status_code == 201
    order_id = order_res.json()["id"]

    chk_res = client.post(
        f"/api/v1/orders/{order_id}/checkout",
        headers=cust_headers,
        json={"payment_method": "card"},
    )
    assert chk_res.status_code == 200
    lic_id = chk_res.json()["license_id"]

    # 2. Record real OCR usage in DB
    from app.common.models.usage import UsageRecord, UsageBalance
    from app.common.enums import QuotaType

    bal = db.query(UsageBalance).filter(UsageBalance.license_id == lic_id).first()
    bal.used_quota += 12
    bal.remaining_quota -= 12
    db.add(
        UsageRecord(
            job_id="job-real-001",
            user_id=customer_one.id,
            license_id=lic_id,
            service_id=pkgs[0]["service_id"],
            amount=12,
            quota_type=QuotaType.PAGE,
            unit_cost=0.0,
        )
    )
    db.commit()

    # 3. Dashboard reflects real customer, order, subscription, license, revenue, and usage
    dash = client.get("/api/v1/admin/dashboard", headers=admin_headers)
    assert dash.status_code == 200
    d = dash.json()
    assert d["total_customers"] >= 1
    assert d["active_services"] >= 1
    assert d["active_subscriptions"] >= 1
    assert d["active_licenses"] >= 1
    assert d["total_revenue"] >= 29.0
    assert d["total_ocr_jobs"] >= 1
    assert d["total_usage_units"] >= 12
    assert len(d["monthly_revenue"]) == 6
    assert len(d["daily_usage"]) == 30
    assert len(d["customer_growth"]) == 6

    # 4. Customers overview & detail
    cust_ov = client.get("/api/v1/admin/customers/overview", headers=admin_headers)
    assert cust_ov.status_code == 200
    cust_list = cust_ov.json()
    c1 = next(c for c in cust_list if c["id"] == customer_one.id)
    assert c1["active_subscriptions_count"] == 1
    assert c1["active_licenses_count"] == 1
    assert c1["total_spend"] == 29.0
    assert c1["total_usage"] == 12

    cust_detail = client.get(f"/api/v1/admin/customers/{customer_one.id}", headers=admin_headers)
    assert cust_detail.status_code == 200
    cd = cust_detail.json()
    assert cd["customer"]["email"] == "customer1@tech.com"
    assert len(cd["subscriptions"]) == 1
    assert len(cd["licenses"]) == 1
    assert len(cd["orders"]) == 1
    assert len(cd["payments"]) == 1
    assert len(cd["usage_records"]) == 1

    # 5. Customer suspend & reactivate persists and logs audit trail
    suspend_res = client.patch(
        f"/api/v1/admin/customers/{customer_one.id}/status",
        headers=admin_headers,
        json={"status": "SUSPENDED"},
    )
    assert suspend_res.status_code == 200
    assert suspend_res.json()["status"] == "SUSPENDED"

    reactivate_res = client.patch(
        f"/api/v1/admin/customers/{customer_one.id}/status",
        headers=admin_headers,
        json={"status": "ACTIVE"},
    )
    assert reactivate_res.status_code == 200
    assert reactivate_res.json()["status"] == "ACTIVE"

    # 6. Orders, payments, subscriptions, usage-records endpoints
    assert any(o["id"] == order_id and o["amount"] == 29.0 for o in client.get("/api/v1/admin/orders", headers=admin_headers).json())
    assert any(p["order_id"] == order_id and p["status"] == "successful" for p in client.get("/api/v1/admin/payments", headers=admin_headers).json())
    assert any(s["user_id"] == customer_one.id and s["used_quota"] == 12 for s in client.get("/api/v1/admin/subscriptions", headers=admin_headers).json())
    assert any(r["job_id"] == "job-real-001" and r["amount"] == 12 for r in client.get("/api/v1/admin/usage-records", headers=admin_headers).json())

    # 7. Licenses overview & status update (suspend / revoke)
    lics_ov = client.get("/api/v1/admin/licenses/overview", headers=admin_headers)
    assert lics_ov.status_code == 200
    assert any(l["id"] == lic_id and l["used_quota"] == 12 for l in lics_ov.json())

    lic_patch = client.patch(
        f"/api/v1/admin/licenses/{lic_id}/status",
        headers=admin_headers,
        json={"status": "suspended", "notes": "Automated compliance hold"},
    )
    assert lic_patch.status_code == 200
    assert lic_patch.json()["status"] == "suspended"
    assert any(ev["action"] == "STATUS_SUSPENDED" for ev in lic_patch.json()["events"])


def test_admin_monitoring_operators_config_and_audit_logs(client, admin_token):
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Mock Ollama telemetry so test is deterministic regardless of local Ollama state
    with (
        patch("app.modules.ocr_engine.service.OCREngineService.check_ollama_health", return_value=(True, "online")),
        patch("app.modules.ocr_engine.service.OCREngineService.get_installed_models", return_value=["qwen2.5vl:3b"]),
        patch("app.modules.ocr_engine.service.OCREngineService.get_loaded_models", return_value=[{"name": "qwen2.5vl:3b", "size_vram": 2400000000}]),
    ):
        mon = client.get("/api/v1/admin/monitoring", headers=admin_headers)
        assert mon.status_code == 200
        m = mon.json()
        assert m["backend_status"] == "running"
        assert m["database_status"] == "online"
        assert m["ollama_status"] == "online"
        assert m["installed_models"] == ["qwen2.5vl:3b"]
        assert len(m["loaded_models"]) == 1

    # System config
    cfg = client.get("/api/v1/admin/system/config", headers=admin_headers)
    assert cfg.status_code == 200
    assert "ollama_model" in cfg.json()
    assert "database_backend" in cfg.json()

    # Operators list + create + duplicate check
    ops_before = client.get("/api/v1/admin/operators", headers=admin_headers)
    assert ops_before.status_code == 200
    assert any(op["email"] == "test_admin@ocrplatform.com" for op in ops_before.json())

    create_op = client.post(
        "/api/v1/admin/operators",
        headers=admin_headers,
        json={
            "email": "sec_operator@ocrplatform.com",
            "full_name": "Security Operator",
            "password": "StrongPassword123!",
        },
    )
    assert create_op.status_code == 201
    assert create_op.json()["role"] == "PLATFORM_ADMIN"

    dup_op = client.post(
        "/api/v1/admin/operators",
        headers=admin_headers,
        json={
            "email": "sec_operator@ocrplatform.com",
            "full_name": "Duplicate",
            "password": "StrongPassword123!",
        },
    )
    assert dup_op.status_code == 409

    # Audit logs contain OPERATOR_CREATED
    logs = client.get("/api/v1/admin/audit-logs", headers=admin_headers)
    assert logs.status_code == 200
    assert any(l["action"] == "OPERATOR_CREATED" for l in logs.json())


def test_admin_delete_endpoints_for_catalog_and_packages(client, admin_token):
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Create & delete document type
    dt_res = client.post(
        "/api/v1/admin/document-types",
        headers=admin_headers,
        json={
            "code": "dt-temp-delete",
            "name": "Temp Doc Type",
            "category": "General",
            "status": "active",
            "supported_service_ids": [],
        },
    )
    assert dt_res.status_code == 201
    dt_id = dt_res.json()["id"]

    del_dt = client.delete(f"/api/v1/admin/document-types/{dt_id}", headers=admin_headers)
    assert del_dt.status_code == 200
    assert del_dt.json()["deleted"] is True

    # Create & delete service + package
    srv_res = client.post(
        "/api/v1/admin/ocr-services",
        headers=admin_headers,
        json={
            "code": "srv-temp-delete",
            "name": "Temp OCR Service",
            "category": "General",
            "description": "Temporary service for delete test",
            "processing_mode": "synchronous",
            "status": "draft",
            "starting_price": 15.0,
        },
    )
    assert srv_res.status_code == 201
    srv_id = srv_res.json()["id"]

    pkg_res = client.post(
        "/api/v1/admin/packages",
        headers=admin_headers,
        json={
            "code": "pkg-temp-delete",
            "name": "Temp Package",
            "tier": "Starter",
            "service_id": srv_id,
            "status": "active",
            "initial_version": {
                "price": 19.0,
                "currency": "USD",
                "quota_type": "Page",
                "quota_amount": 500,
                "duration": "monthly",
                "billing_type": "one_time",
            },
        },
    )
    assert pkg_res.status_code == 201
    pkg_id = pkg_res.json()["id"]

    del_pkg = client.delete(f"/api/v1/admin/packages/{pkg_id}", headers=admin_headers)
    assert del_pkg.status_code == 200
    assert del_pkg.json()["deleted"] is True

    del_srv = client.delete(f"/api/v1/admin/ocr-services/{srv_id}", headers=admin_headers)
    assert del_srv.status_code == 200
    assert del_srv.json()["deleted"] is True
