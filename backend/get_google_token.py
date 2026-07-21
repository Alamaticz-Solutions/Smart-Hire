import os
import urllib.parse
import requests

def main():
    print("==================================================")
    print("      Hire AI - Google Drive Token Helper         ")
    print("==================================================")
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    client_secret_path = os.path.join(script_dir, "Client_secret.json")
    if not os.path.exists(client_secret_path):
        # check alternative name
        alternative_path = os.path.join(script_dir, "client_secret_963540564468-gdtguqfdi6178vaat0vuhu7ntaf38p2g.apps.googleusercontent.com.json")
        if os.path.exists(alternative_path):
            client_secret_path = alternative_path
        else:
            print("ERROR: Client_secret.json not found in 'backend/' directory.")
            print("Please make sure you downloaded the OAuth Client Secret JSON and renamed it to Client_secret.json inside 'backend/'.")
            return

    import json
    with open(client_secret_path, 'r') as f:
        data = json.load(f)
    
    key = "web" if "web" in data else "installed"
    if key not in data:
        print("ERROR: Unexpected client secret JSON format. Could not find 'web' or 'installed' key.")
        return
        
    client_id = data[key]["client_id"]
    client_secret = data[key]["client_secret"]
    
    # We will use http://localhost as the redirect URI.
    # Note: If this is a Web Client, they MUST add http://localhost to their Authorized Redirect URIs in Google Cloud Console.
    redirect_uri = "http://localhost"
    
    # Scope for accessing/uploading Google Drive files created by this app
    scope = "https://www.googleapis.com/auth/drive.file"
    
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": scope,
        "access_type": "offline",
        "prompt": "consent"
    }
    
    auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)
    
    print("\n1. Please open the following URL in your web browser and authorize access:")
    print("-" * 80)
    print(auth_url)
    print("-" * 80)
    
    print("\n2. After authorizing, your browser will redirect to a URL like:")
    print("   http://localhost/?code=4/0Af...&scope=...")
    print("\n3. Copy the entire redirect URL or just the code (the part after 'code=') and paste it here:")
    
    code_input = input("Paste here: ").strip()
    if not code_input:
        print("ERROR: Code input cannot be empty.")
        return
        
    # Extract code if full URL was pasted
    code = code_input
    if "code=" in code_input:
        try:
            parsed = urllib.parse.urlparse(code_input)
            code = urllib.parse.parse_qs(parsed.query)["code"][0]
        except Exception:
            pass
            
    print(f"\nExchanging authorization code for tokens...")
    
    token_url = "https://oauth2.googleapis.com/token"
    token_data = {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code"
    }
    
    resp = requests.post(token_url, data=token_data)
    if resp.status_code != 200:
        print(f"\nERROR: Token exchange failed ({resp.status_code}):")
        print(resp.text)
        print("\nMake sure:")
        print("1. If using a Web Client ID, you added 'http://localhost' to Authorized redirect URIs in Google Cloud Console.")
        print("2. You authorized the consent screen successfully.")
        return
        
    resp_data = resp.json()
    refresh_token = resp_data.get("refresh_token")
    
    if not refresh_token:
        # Sometimes Google doesn't send refresh_token on subsequent logins unless consent prompt is shown
        refresh_token = resp_data.get("refresh_token")
        if not refresh_token:
            print("\nWARNING: No refresh token returned. Google only sends the refresh token on the FIRST authorization.")
            print("To fix this, go to Google Account Settings -> Security -> Third-party apps with account access,")
            print("remove 'Hire AI' access, and run this script again.")
            print(f"Response details: {resp_data}")
            return
        
    print("\nSUCCESS! Received Refresh Token.")
    
    # Read and update .env file
    env_path = os.path.join(script_dir, ".env")
    if not os.path.exists(env_path):
        print(f"WARNING: .env file not found at {env_path}. Could not auto-save.")
        print(f"Refresh Token: {refresh_token}")
        return
        
    with open(env_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    new_lines = []
    updated_keys = {
        "GDRIVE_CLIENT_ID": client_id,
        "GDRIVE_CLIENT_SECRET": client_secret,
        "GDRIVE_REFRESH_TOKEN": refresh_token
    }
    
    keys_written = set()
    for line in lines:
        matched = False
        for k, v in updated_keys.items():
            if line.strip().startswith(f"{k}="):
                new_lines.append(f'{k}="{v}"\n')
                keys_written.add(k)
                matched = True
                break
        if not matched:
            new_lines.append(line)
            
    # Add any missing keys
    for k, v in updated_keys.items():
        if k not in keys_written:
            if new_lines and not new_lines[-1].endswith('\n'):
                new_lines.append('\n')
            new_lines.append(f'{k}="{v}"\n')
            
    with open(env_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
        
    print(f"\nUpdated {env_path} successfully with Google Drive credentials!")
    print("Please restart the backend server to apply these changes.")

if __name__ == '__main__':
    main()
