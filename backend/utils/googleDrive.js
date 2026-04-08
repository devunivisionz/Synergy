const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

const SCOPES = ["https://www.googleapis.com/auth/drive"];

// Initialize Google Auth
let auth;
let drive;

try {
	const credentialsPath = path.join(__dirname, "../google-credentials.json");

	// Check if credentials file exists
	if (!fs.existsSync(credentialsPath)) {
		throw new Error(
			`Google credentials file not found at: ${credentialsPath}`
		);
	}

	// Validate credentials file
	const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
	if (!credentials.private_key || !credentials.client_email) {
		throw new Error(
			"Invalid Google credentials file: missing required fields"
		);
	}

	auth = new google.auth.GoogleAuth({
		keyFile: credentialsPath,
		scopes: SCOPES,
	});

	drive = google.drive({ version: "v3", auth });
	console.log("Google Drive authentication initialized successfully");
} catch (error) {
	console.error(
		"Failed to initialize Google Drive authentication:",
		error.message
	);
	throw error;
}

// Configuration
const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || null; // Folder or Shared Drive ID
const SHARED_DRIVE_ID = process.env.SHARED_DRIVE_ID || null; // Set this if using shared drive

async function uploadFile(filePath, fileName, fileType = "merged") {
	try {
		console.log(
			`[GoogleDrive] Starting upload: ${filePath} -> ${fileName} (type: ${fileType})`
		);

		// Verify file exists and is readable
		if (!fs.existsSync(filePath)) {
			throw new Error(`File not found: ${filePath}`);
		}

		const fileStats = fs.statSync(filePath);
		if (fileStats.size === 0) {
			throw new Error(`File is empty: ${filePath}`);
		}

		console.log(`[GoogleDrive] File size: ${fileStats.size} bytes`);

		// Determine target folder based on file type
		let targetFolderId = DRIVE_FOLDER_ID; // Default to main folder

		switch (fileType) {
			case "manuscript":
				targetFolderId =
					process.env.GOOGLE_DRIVE_MANUSCRIPTS_FOLDER ||
					DRIVE_FOLDER_ID;
				break;
			case "coverLetter":
				targetFolderId =
					process.env.GOOGLE_DRIVE_COVERLETTERS_FOLDER ||
					DRIVE_FOLDER_ID;
				break;
			case "declaration":
				targetFolderId =
					process.env.GOOGLE_DRIVE_DECLARATIONS_FOLDER ||
					DRIVE_FOLDER_ID;
				break;
			case "merged":
				targetFolderId =
					process.env.GOOGLE_DRIVE_MERGED_FOLDER || DRIVE_FOLDER_ID;
				break;
		}

		const fileMetadata = {
			name: fileName,
			// Use specific folder based on file type
			...(targetFolderId && { parents: [targetFolderId] }),
		};

		const media = {
			mimeType: "application/pdf",
			body: fs.createReadStream(filePath),
		};

		console.log("[GoogleDrive] Creating file on Google Drive...");
		const response = await drive.files.create({
			resource: fileMetadata,
			media: media,
			fields: "id,webViewLink,webContentLink",
			// Use shared drive support if needed
			...(SHARED_DRIVE_ID && { supportsAllDrives: true }),
		});

		if (!response.data.id) {
			throw new Error(
				"Failed to create file on Google Drive: no file ID returned"
			);
		}

		console.log(`[GoogleDrive] File created with ID: ${response.data.id}`);

		// Make the file publicly readable
		console.log("[GoogleDrive] Setting file permissions...");
		await drive.permissions.create({
			fileId: response.data.id,
			requestBody: {
				role: "reader",
				type: "anyone",
			},
			// Use shared drive support if needed
			...(SHARED_DRIVE_ID && { supportsAllDrives: true }),
		});

		// Get the file details with links
		console.log("[GoogleDrive] Getting file details...");
		const fileData = await drive.files.get({
			fileId: response.data.id,
			fields: "id,webViewLink,webContentLink,name,size,mimeType",
			// Use shared drive support if needed
			...(SHARED_DRIVE_ID && { supportsAllDrives: true }),
		});

		const result = {
			fileId: response.data.id,
			webViewLink: fileData.data.webViewLink,
			webContentLink: fileData.data.webContentLink,
			fileName: fileData.data.name,
			fileSize: fileData.data.size,
		};

		console.log("[GoogleDrive] Upload completed successfully:", result);
		return result;
	} catch (error) {
		console.error("Error uploading file to Google Drive:", error);

		// Provide more specific error information
		if (error.response) {
			console.error("Google API Error Response:", {
				status: error.response.status,
				statusText: error.response.statusText,
				data: error.response.data,
			});
		}

		// Re-throw with more context
		throw new Error(`Google Drive upload failed: ${error.message}`);
	}
}

// Test Google Drive connection
async function testConnection() {
	try {
		console.log("[GoogleDrive] Testing connection...");
		const response = await drive.about.get({
			fields: "user(displayName,emailAddress),storageQuota(limit,usage)",
		});

		console.log("[GoogleDrive] Connection successful!");
		console.log("User:", response.data.user);
		console.log("Storage:", response.data.storageQuota);
		return true;
	} catch (error) {
		console.error("[GoogleDrive] Connection test failed:", error.message);
		if (error.response) {
			console.error("API Response:", error.response.data);
		}
		return false;
	}
}

module.exports = { uploadFile, testConnection };
