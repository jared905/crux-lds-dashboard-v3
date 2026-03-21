export default function PrivacyPolicy() {
  const sectionStyle = { marginBottom: "32px" };
  const h2Style = { fontSize: "18px", fontWeight: "700", marginBottom: "12px", color: "#E0E0E0" };
  const pStyle = { fontSize: "14px", color: "#BDBDBD", lineHeight: "1.7", marginBottom: "12px" };
  const ulStyle = { fontSize: "14px", color: "#BDBDBD", lineHeight: "1.8", paddingLeft: "24px", marginBottom: "12px" };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#181817",
      color: "#E0E0E0",
      padding: "0",
    }}>
      {/* Header */}
      <div style={{
        borderBottom: "1px solid #333",
        padding: "24px 40px",
        display: "flex",
        alignItems: "center",
        gap: "16px",
      }}>
        <img src="/Full_View_Logo.png" alt="Full View Studio" style={{ height: "40px" }} />
        <span style={{ fontSize: "18px", fontWeight: "700" }}>Full View Studio</span>
      </div>

      {/* Content */}
      <div style={{
        maxWidth: "800px",
        margin: "0 auto",
        padding: "48px 40px 80px",
      }}>
        <h1 style={{ fontSize: "32px", fontWeight: "800", marginBottom: "8px" }}>Privacy Policy</h1>
        <p style={{ fontSize: "13px", color: "#9E9E9E", marginBottom: "40px" }}>
          Last updated: March 20, 2026
        </p>

        <div style={sectionStyle}>
          <h2 style={h2Style}>1. Introduction</h2>
          <p style={pStyle}>
            Full View Studio ("the App") is a YouTube analytics and content strategy platform operated by Crux Media ("we," "us," or "our"). This Privacy Policy explains how we collect, use, store, and protect information when you use our application.
          </p>
          <p style={pStyle}>
            By using Full View Studio, you agree to the collection and use of information in accordance with this policy.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>2. Information We Collect</h2>
          <p style={pStyle}><strong>Account Information:</strong></p>
          <ul style={ulStyle}>
            <li>Email address (used for authentication and account management)</li>
            <li>Password (securely hashed, never stored in plain text)</li>
          </ul>
          <p style={pStyle}><strong>YouTube Data (via Google OAuth):</strong></p>
          <p style={pStyle}>
            When you connect your YouTube channel, we request access to the following data through Google's OAuth 2.0 authorization:
          </p>
          <ul style={ulStyle}>
            <li><strong>YouTube channel information</strong> (read-only): Channel name, subscriber count, video metadata, and public statistics</li>
            <li><strong>YouTube Analytics data</strong> (read-only): Video performance metrics including views, watch time, impressions, click-through rates, and audience retention</li>
            <li><strong>YouTube Analytics monetary data</strong> (read-only): Revenue-related performance metrics for channels that have monetization enabled</li>
            <li><strong>Basic profile information</strong>: Your Google account email address for identity verification</li>
          </ul>
          <p style={pStyle}><strong>Uploaded Data:</strong></p>
          <ul style={ulStyle}>
            <li>YouTube Studio CSV exports that you manually upload for analysis</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>3. How We Use Your Information</h2>
          <p style={pStyle}>We use the collected information to:</p>
          <ul style={ulStyle}>
            <li>Display your YouTube channel analytics and performance data within the dashboard</li>
            <li>Generate content strategy insights, benchmarks, and recommendations</li>
            <li>Detect content series patterns and analyze performance trends</li>
            <li>Provide competitive benchmarking against other channels in your space</li>
            <li>Generate AI-powered audit reports and strategic recommendations</li>
            <li>Authenticate your identity and manage your account</li>
          </ul>
          <p style={pStyle}>
            We do <strong>not</strong> use your data for advertising, sell your data to third parties, or share your data with any entity outside of the services described above.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>4. Data Storage and Security</h2>
          <ul style={ulStyle}>
            <li><strong>Database:</strong> Your data is stored in a secure Supabase (PostgreSQL) database with row-level security policies enforced</li>
            <li><strong>OAuth tokens:</strong> YouTube OAuth tokens are encrypted using AES-256-GCM encryption before storage. Encryption keys are stored as server-side environment variables and are never exposed to the client</li>
            <li><strong>Authentication:</strong> OAuth flows use PKCE (Proof Key for Code Exchange, RFC 7636) for enhanced security. Token exchange happens server-side only</li>
            <li><strong>Transport:</strong> All data is transmitted over HTTPS/TLS</li>
            <li><strong>Access control:</strong> Role-based access controls restrict data visibility to authorized users only</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>5. Third-Party Services</h2>
          <p style={pStyle}>Full View Studio integrates with the following third-party services:</p>
          <ul style={ulStyle}>
            <li><strong>Google/YouTube APIs:</strong> To access your YouTube channel data and analytics. Subject to the <a href="https://policies.google.com/privacy" style={{ color: "#60a5fa" }}>Google Privacy Policy</a></li>
            <li><strong>Supabase:</strong> For database hosting and user authentication</li>
            <li><strong>Anthropic (Claude AI):</strong> For generating content strategy insights and recommendations. Channel data summaries (not raw video data) may be sent to Claude for analysis. No personally identifiable information is included in AI requests</li>
            <li><strong>Vercel:</strong> For application hosting and serverless functions</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>6. Google API Services User Data Policy</h2>
          <p style={pStyle}>
            Full View Studio's use and transfer of information received from Google APIs adheres to the{" "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" style={{ color: "#60a5fa" }}>
              Google API Services User Data Policy
            </a>, including the Limited Use requirements.
          </p>
          <p style={pStyle}>Specifically:</p>
          <ul style={ulStyle}>
            <li>We only request access to the data necessary to provide the App's features</li>
            <li>We do not use Google user data for serving advertisements</li>
            <li>We do not sell Google user data to third parties</li>
            <li>We do not use Google user data for purposes unrelated to the App's core functionality</li>
            <li>Human access to Google user data is limited to what is necessary for security, compliance, or operating the service, unless we obtain your explicit consent</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>7. Data Retention and Deletion</h2>
          <ul style={ulStyle}>
            <li>Your data is retained for as long as your account is active</li>
            <li>You may disconnect your YouTube channel at any time, which revokes our access to your YouTube data and deletes stored OAuth tokens</li>
            <li>You may request complete deletion of your account and all associated data by contacting us at the email below</li>
            <li>Upon account deletion, all your data — including analytics, audit reports, and stored tokens — will be permanently removed within 30 days</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>8. Your Rights</h2>
          <p style={pStyle}>You have the right to:</p>
          <ul style={ulStyle}>
            <li>Access the personal data we hold about you</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Revoke YouTube OAuth access at any time through the App or through your <a href="https://myaccount.google.com/permissions" style={{ color: "#60a5fa" }}>Google Account permissions</a></li>
            <li>Export your data upon request</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>9. Changes to This Policy</h2>
          <p style={pStyle}>
            We may update this Privacy Policy from time to time. We will notify users of any material changes by posting the updated policy within the App. Your continued use of Full View Studio after changes constitutes acceptance of the updated policy.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>10. Contact Us</h2>
          <p style={pStyle}>
            If you have questions about this Privacy Policy, your data, or wish to exercise any of your rights, contact us at:
          </p>
          <p style={pStyle}>
            <strong>Crux Media</strong><br />
            Email: <a href="mailto:security@crux.media" style={{ color: "#60a5fa" }}>security@crux.media</a>
          </p>
        </div>
      </div>
    </div>
  );
}
