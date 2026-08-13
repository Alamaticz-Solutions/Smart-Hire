# Use the official Python image
FROM python:3.10-slim

# Install system dependencies for Node.js
RUN apt-get update && apt-get install -y curl
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
RUN apt-get install -y nodejs

# Set working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY backend/requirements.txt backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy frontend package.json and install Node dependencies
COPY frontend/package.json frontend/
WORKDIR /app/frontend
RUN npm install

# Copy the rest of the application
WORKDIR /app
COPY . .

# Build the frontend
WORKDIR /app/frontend
RUN npm run build

# Set working directory to backend so Python module imports resolve correctly
WORKDIR /app/backend

# Expose the port
EXPOSE 8000

# Command to run the application dynamically respecting the PORT environment variable set by Render
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
