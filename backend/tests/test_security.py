def test_customer_cannot_access_other_customer_order(client, customer_one_token, customer_two_token):
    packages = client.get("/api/v1/packages/pkg-test-1").json()
    version_id = packages["current_version"]["id"]

    # Customer One creates an order
    res1 = client.post(
        "/api/v1/orders",
        headers={"Authorization": f"Bearer {customer_one_token}"},
        json={"package_version_id": version_id}
    )
    assert res1.status_code == 201
    order_id = res1.json()["id"]

    # Customer Two tries to access Customer One's order
    res2 = client.get(
        f"/api/v1/orders/{order_id}",
        headers={"Authorization": f"Bearer {customer_two_token}"}
    )
    assert res2.status_code in [403, 404]

    # Customer Two tries to checkout Customer One's order
    res3 = client.post(
        f"/api/v1/orders/{order_id}/checkout",
        headers={"Authorization": f"Bearer {customer_two_token}"},
        json={"payment_method": "mock_card"}
    )
    assert res3.status_code == 403

def test_customer_cannot_access_other_customer_license(client, customer_one_token, customer_two_token):
    # Customer One creates an order and checks out to obtain a license
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
    c1_lic_id = checkout_res.json()["license_id"]

    # Customer Two attempts to view Customer One's license details
    res = client.get(
        f"/api/v1/licenses/{c1_lic_id}",
        headers={"Authorization": f"Bearer {customer_two_token}"}
    )
    assert res.status_code == 403

def test_customer_cannot_access_admin_api(client, customer_one_token):
    res = client.get(
        "/api/v1/admin/packages",
        headers={"Authorization": f"Bearer {customer_one_token}"}
    )
    assert res.status_code == 403

    res2 = client.get(
        "/api/v1/admin/customers",
        headers={"Authorization": f"Bearer {customer_one_token}"}
    )
    assert res2.status_code == 403

def test_admin_can_access_admin_api(client, admin_token):
    res = client.get(
        "/api/v1/admin/packages",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert res.status_code == 200

    res2 = client.get(
        "/api/v1/admin/customers",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert res2.status_code == 200
