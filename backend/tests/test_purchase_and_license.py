def test_order_creation_and_failed_payment(client, customer_one_token):
    packages = client.get("/api/v1/packages/pkg-test-1").json()
    version_id = packages["current_version"]["id"]

    # 1. Create Order
    order_res = client.post(
        "/api/v1/orders",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"package_version_id": version_id}
    )
    assert order_res.status_code == 201
    order_data = order_res.json()
    assert order_data["status"] == "pending"
    assert order_data["amount"] == 29.0
    order_id = order_data["id"]

    # 2. Checkout with simulated failure
    checkout_res = client.post(
        f"/api/v1/orders/{order_id}/checkout",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"payment_method": "mock_card", "simulate_failure": True}
    )
    assert checkout_res.status_code == 200
    res_data = checkout_res.json()
    assert res_data["order"]["status"] == "failed"
    assert res_data["payment"]["status"] == "failed"
    assert res_data["license_id"] is None

def test_successful_checkout_automatic_license_issuance(client, customer_one_token):
    packages = client.get("/api/v1/packages/pkg-test-1").json()
    version_id = packages["current_version"]["id"]

    # 1. Create Order
    order_res = client.post(
        "/api/v1/orders",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"package_version_id": version_id}
    )
    assert order_res.status_code == 201
    order_id = order_res.json()["id"]

    # 2. Checkout successfully
    checkout_res = client.post(
        f"/api/v1/orders/{order_id}/checkout",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"payment_method": "mock_card", "simulate_failure": False}
    )
    assert checkout_res.status_code == 200
    res_data = checkout_res.json()
    assert res_data["order"]["status"] == "completed"
    assert res_data["payment"]["status"] == "successful"
    assert res_data["subscription_id"] is not None
    assert res_data["license_id"] is not None
    assert res_data["license_key"] is not None  # Full key returned ONCE at checkout
    assert res_data["license_key"].startswith("OCR-2026-")
    assert res_data["masked_key"] is not None
    license_id = res_data["license_id"]
    license_key = res_data["license_key"]

    # 3. Verify Subscription was created
    sub_res = client.get(f"/api/v1/subscriptions/{res_data['subscription_id']}", headers={"Authorization": f"Bearer {customer_one_token}"})
    assert sub_res.status_code == 200
    sub_data = sub_res.json()
    assert sub_data["status"] == "active"
    assert sub_data["total_quota"] == 1000

    # 4. Verify License was created and listed with MASKED key
    lic_list_res = client.get("/api/v1/licenses", headers={"Authorization": f"Bearer {customer_one_token}"})
    assert lic_list_res.status_code == 200
    licenses = lic_list_res.json()
    target_lic = next((l for l in licenses if l["id"] == license_id), None)
    assert target_lic is not None
    assert target_lic["masked_key"] == res_data["masked_key"]
    assert "license_key" not in target_lic  # FULL KEY NEVER EXPOSED IN LIST VIEW!
    assert target_lic["quota"] == 1000
    assert target_lic["remaining_quota"] == 1000

    # 5. Verify Idempotency: Repeating checkout on already completed order does NOT duplicate
    idemp_res = client.post(
        f"/api/v1/orders/{order_id}/checkout",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"payment_method": "mock_card", "simulate_failure": False}
    )
    assert idemp_res.status_code == 200
    idemp_data = idemp_res.json()
    assert idemp_data["order"]["id"] == order_id
    assert idemp_data["license_id"] == license_id

    # Count customer licenses to ensure no duplicate license created
    lic_list_after = client.get("/api/v1/licenses", headers={"Authorization": f"Bearer {customer_one_token}"}).json()
    assert len(lic_list_after) == len(licenses)

def test_api_credential_generation_and_revocation(client, customer_one_token):
    # Customer One acquires a license first
    packages = client.get("/api/v1/packages/pkg-test-1").json()
    version_id = packages["current_version"]["id"]

    order_res = client.post(
        "/api/v1/orders",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"package_version_id": version_id}
    )
    order_id = order_res.json()["id"]

    checkout_res = client.post(
        f"/api/v1/orders/{order_id}/checkout",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"payment_method": "mock_card"}
    )
    license_id = checkout_res.json()["license_id"]

    # 1. Create API Credential
    cred_res = client.post(
        f"/api/v1/licenses/{license_id}/credentials",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"name": "Production Server Key"}
    )
    assert cred_res.status_code == 201
    cred_data = cred_res.json()
    assert "api_key" in cred_data
    assert cred_data["api_key"].startswith("ocr_live_")
    cred_id = cred_data["id"]

    # 2. List credentials - check masked key
    list_creds = client.get(f"/api/v1/licenses/{license_id}/credentials", headers={"Authorization": f"Bearer {customer_one_token}"}).json()
    assert any(c["id"] == cred_id for c in list_creds)
    target = next(c for c in list_creds if c["id"] == cred_id)
    assert target["status"] == "active"

    # 3. Revoke credential
    del_res = client.delete(
        f"/api/v1/licenses/{license_id}/credentials/{cred_id}",
        headers={"Authorization": f"Bearer {customer_one_token}"}
    )
    assert del_res.status_code == 200

    # 4. Verify status is revoked
    list_creds_after = client.get(f"/api/v1/licenses/{license_id}/credentials", headers={"Authorization": f"Bearer {customer_one_token}"}).json()
    target_after = next(c for c in list_creds_after if c["id"] == cred_id)
    assert target_after["status"] == "revoked"
