import os
for root, dirs, files in os.walk("frontend"):
    for file in files:
        if file.endswith(('.js', '.jsx', '.ts', '.tsx', '.html')):
            path = os.path.join(root, file)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
                if "x-user-username" in content or "x-user-role" in content:
                    print(f"{path}: has it")
            except Exception:
                pass
