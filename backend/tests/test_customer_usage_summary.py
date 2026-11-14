def test_customer_usage_summary_empty_for_fresh_customer(client, customer_two_token):
    headers = {"Authorization": f"Bearer {customer_two_token}"}
    res = client.get("/api/v1/usage/summary", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total_quota"] == 0
    assert data["used_quota"] == 0
    assert data["remaining_quota"] == 0
    assert data["active_licenses"] == 0
    assert data["active_subscriptions"] == 0
    assert data["total_jobs"] == 0
    assert data["avg_latency_ms"] == 0.0
    assert data["balances"] == []
    assert len(data["daily_usage"]) == 30
    assert all(d["units"] == 0 and d["jobs"] == 0 for d in data["daily_usage"])
    assert data["service_breakdown"] == []


def test_customer_usage_summary_reflects_real_purchase_and_usage_isolated_per_user(
    client, db, customer_one, customer_one_token, customer_two_token
):
    c1_headers = {"Authorization": f"Bearer {customer_one_token}"}
    c2_headers = {"Authorization": f"Bearer {customer_two_token}"}

    pkgs = client.get("/api/v1/packages").json()
    pv_id = pkgs[0]["current_version"]["id"]
    service_id = pkgs[0]["service_id"]

    order_res = client.post(
        "/api/v1/orders",
        headers=c1_headers,
        json={"package_version_id": pv_id},
    )
    assert order_res.status_code == 201
    order_id = order_res.json()["id"]

    chk_res = client.post(
        f"/api/v1/orders/{order_id}/checkout",
        headers=c1_headers,
        json={"payment_method": "card"},
    )
    assert chk_res.status_code == 200
    lic_id = chk_res.json()["license_id"]

    from app.common.models.usage import UsageRecord, UsageBalance
    from app.common.enums import QuotaType

    bal = db.query(UsageBalance).filter(UsageBalance.license_id == lic_id).first()
    bal.used_quota += 7
    bal.remaining_quota -= 7
    db.add(
        UsageRecord(
            job_id="job-cust1-001",
            user_id=customer_one.id,
            license_id=lic_id,
            service_id=service_id,
            amount=7,
            quota_type=QuotaType.PAGE,
            unit_cost=0.0,
        )
    )
    db.commit()

    # Customer 1 sees exact real usage
    res1 = client.get("/api/v1/usage/summary", headers=c1_headers)
    assert res1.status_code == 200
    d1 = res1.json()
    assert d1["total_quota"] == 1000
    assert d1["used_quota"] == 7
    assert d1["remaining_quota"] == 993
    assert d1["active_licenses"] == 1
    assert d1["active_subscriptions"] == 1
    assert d1["total_jobs"] >= 1
    assert sum(p["units"] for p in d1["daily_usage"]) == 7
    assert len(d1["service_breakdown"]) == 1
    assert d1["service_breakdown"][0]["service_id"] == service_id
    assert d1["service_breakdown"][0]["usage_units"] == 7
    assert d1["service_breakdown"][0]["percentage"] == 100.0

    # Customer 2 remains strictly isolated at 0
    res2 = client.get("/api/v1/usage/summary", headers=c2_headers)
    assert res2.status_code == 200
    d2 = res2.json()
    assert d2["total_quota"] == 0
    assert d2["used_quota"] == 0
    assert d2["service_breakdown"] == []
