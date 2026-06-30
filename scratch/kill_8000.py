import os
import subprocess

try:
    out = subprocess.check_output('netstat -aon', shell=True).decode('utf-8', errors='ignore')
    for line in out.splitlines():
        parts = line.strip().split()
        if len(parts) >= 5 and ':8000' in parts[1]:
            pid = parts[-1]
            print(f"Found process on port 8000: PID {pid}. Killing it...")
            subprocess.call(f"taskkill /f /pid {pid}", shell=True)
except Exception as e:
    print(f"Error: {e}")
