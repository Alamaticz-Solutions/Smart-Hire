"""Print a new SECRETS_KEY. Put it in backend/.env (and in the hosting environment) and keep a copy safe."""
from cryptography.fernet import Fernet

if __name__ == "__main__":
    print(Fernet.generate_key().decode())
