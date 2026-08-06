import os
import sqlite3
from dotenv import load_dotenv
load_dotenv('.env')

from postgres_adapter import patch_if_configured
patch_if_configured()

# Mock request class
class MockRequest:
    headers = {"x-user-username": "admin"}

import main

try:
    res = main.get_integrations_settings(MockRequest())
    print("SUCCESS")
    print(res)
except Exception as e:
    import traceback
    print("FAILED")
    traceback.print_exc()
