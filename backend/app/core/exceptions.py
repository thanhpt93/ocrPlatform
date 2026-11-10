from fastapi import HTTPException, status

class AppException(HTTPException):
    def __init__(self, status_code: int, detail: str, code: str = "ERROR"):
        super().__init__(status_code=status_code, detail={"message": detail, "code": code})

class EntityNotFoundException(AppException):
    def __init__(self, entity_name: str, identifier: str = ""):
        detail = f"{entity_name} not found" if not identifier else f"{entity_name} '{identifier}' not found"
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, detail=detail, code="NOT_FOUND")

class EntityAlreadyExistsException(AppException):
    def __init__(self, entity_name: str, field: str = "item"):
        super().__init__(status_code=status.HTTP_409_CONFLICT, detail=f"{entity_name} with this {field} already exists", code="ALREADY_EXISTS")

class UnauthorizedException(AppException):
    def __init__(self, detail: str = "Could not validate credentials"):
        super().__init__(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail, code="UNAUTHORIZED")

class ForbiddenException(AppException):
    def __init__(self, detail: str = "You do not have permission to perform this action"):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail, code="FORBIDDEN")

class BadRequestException(AppException):
    def __init__(self, detail: str):
        super().__init__(status_code=status.HTTP_400_BAD_REQUEST, detail=detail, code="BAD_REQUEST")

class ConflictException(AppException):
    def __init__(self, detail: str):
        super().__init__(status_code=status.HTTP_409_CONFLICT, detail=detail, code="CONFLICT")
