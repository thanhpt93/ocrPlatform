def test_register_success(client):
    res = client.post("/api/v1/auth/register", json={
        "email": "newuser@example.com",
        "password": "SecurePassword123",
        "full_name": "New User",
        "company_name": "Example Corp",
        "phone": "+1234567890"
    })
    assert res.status_code == 201
    data = res.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["email"] == "newuser@example.com"
    assert data["role"] == "CUSTOMER"

def test_register_duplicate_email(client):
    client.post("/api/v1/auth/register", json={
        "email": "dup@example.com",
        "password": "Password123",
        "full_name": "First User"
    })
    res2 = client.post("/api/v1/auth/register", json={
        "email": "dup@example.com",
        "password": "Password123",
        "full_name": "Second User"
    })
    assert res2.status_code == 409

def test_login_success(client, customer_one):
    res = client.post("/api/v1/auth/login", json={
        "email": "customer1@tech.com",
        "password": "CustomerPass123"
    })
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["email"] == "customer1@tech.com"

def test_login_invalid_credentials(client, customer_one):
    res = client.post("/api/v1/auth/login", json={
        "email": "customer1@tech.com",
        "password": "WrongPassword!"
    })
    assert res.status_code == 401

def test_get_current_user_profile(client, customer_one_token):
    res = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {customer_one_token}"})
    assert res.status_code == 200
    data = res.json()
    assert data["email"] == "customer1@tech.com"
    assert data["role"] == "CUSTOMER"

def test_unauthorized_without_token(client):
    res = client.get("/api/v1/users/me")
    assert res.status_code == 401
