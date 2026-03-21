export default function TermsOfService() {
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
        <h1 style={{ fontSize: "32px", fontWeight: "800", marginBottom: "8px" }}>Terms of Service</h1>
        <p style={{ fontSize: "13px", color: "#9E9E9E", marginBottom: "40px" }}>
          Last updated: March 20, 2026
        </p>

        <div style={sectionStyle}>
          <h2 style={h2Style}>1. Acceptance of Terms</h2>
          <p style={pStyle}>
            By accessing or using Full View Studio ("the App"), operated by Crux Media ("we," "us," or "our"), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the App.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>2. Description of Service</h2>
          <p style={pStyle}>
            Full View Studio is a YouTube analytics and content strategy platform that provides:
          </p>
          <ul style={ulStyle}>
            <li>YouTube channel performance analytics and reporting</li>
            <li>Content series detection and trend analysis</li>
            <li>Competitive benchmarking and landscape analysis</li>
            <li>AI-powered content strategy recommendations and audit reports</li>
            <li>Content ideation and planning tools</li>
          </ul>
          <p style={pStyle}>
            The App integrates with YouTube and Google services via authorized API access to provide these features.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>3. Account Registration</h2>
          <ul style={ulStyle}>
            <li>You must provide a valid email address and create a password to use the App</li>
            <li>You are responsible for maintaining the confidentiality of your account credentials</li>
            <li>You are responsible for all activity that occurs under your account</li>
            <li>You must notify us immediately of any unauthorized use of your account</li>
            <li>You must be at least 18 years old or have the consent of a parent or guardian to use the App</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>4. YouTube and Google API Usage</h2>
          <p style={pStyle}>
            When you connect your YouTube channel to Full View Studio:
          </p>
          <ul style={ulStyle}>
            <li>You authorize us to access your YouTube data in accordance with our <a href="/privacy" style={{ color: "#60a5fa" }}>Privacy Policy</a></li>
            <li>You represent that you have the authority to grant access to the YouTube channel(s) you connect</li>
            <li>You may revoke access at any time through the App settings or your <a href="https://myaccount.google.com/permissions" style={{ color: "#60a5fa" }}>Google Account permissions</a></li>
            <li>Our use of YouTube data is subject to <a href="https://www.youtube.com/t/terms" style={{ color: "#60a5fa" }}>YouTube's Terms of Service</a> and <a href="https://policies.google.com/privacy" style={{ color: "#60a5fa" }}>Google's Privacy Policy</a></li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>5. Acceptable Use</h2>
          <p style={pStyle}>You agree not to:</p>
          <ul style={ulStyle}>
            <li>Use the App for any unlawful purpose or in violation of any applicable laws</li>
            <li>Attempt to gain unauthorized access to other users' accounts or data</li>
            <li>Reverse engineer, decompile, or disassemble any part of the App</li>
            <li>Use automated tools to scrape, crawl, or extract data from the App beyond normal usage</li>
            <li>Share your account credentials with others or allow multiple individuals to use a single account</li>
            <li>Upload malicious content, viruses, or harmful code</li>
            <li>Use the App to harass, abuse, or harm other users or third parties</li>
            <li>Misrepresent your identity or your authority over any YouTube channel</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>6. Intellectual Property</h2>
          <ul style={ulStyle}>
            <li><strong>Our IP:</strong> The App, including its design, code, features, and branding, is owned by Crux Media and protected by intellectual property laws. You may not copy, modify, or distribute any part of the App without our written consent.</li>
            <li><strong>Your Data:</strong> You retain ownership of your YouTube channel data and any content you upload to the App. By using the App, you grant us a limited license to process your data solely for the purpose of providing the service.</li>
            <li><strong>AI-Generated Content:</strong> Insights, recommendations, and reports generated by the App's AI features are provided as guidance. You are free to use these outputs for your own business purposes.</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>7. Service Availability and Limitations</h2>
          <ul style={ulStyle}>
            <li>The App is provided on an "as-is" and "as-available" basis</li>
            <li>We do not guarantee uninterrupted or error-free service</li>
            <li>Features may be modified, added, or removed at any time</li>
            <li>YouTube API quotas and rate limits may affect data availability and refresh frequency</li>
            <li>AI-generated insights are based on available data and should not be treated as guaranteed outcomes or professional advice</li>
            <li>We reserve the right to suspend or terminate accounts that violate these terms</li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>8. Limitation of Liability</h2>
          <p style={pStyle}>
            To the maximum extent permitted by law, Crux Media shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the App. This includes, but is not limited to, loss of revenue, data, or business opportunities.
          </p>
          <p style={pStyle}>
            Our total liability for any claim related to the App shall not exceed the amount you have paid us in the twelve (12) months preceding the claim, or $100, whichever is greater.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>9. Termination</h2>
          <ul style={ulStyle}>
            <li>You may stop using the App and request account deletion at any time by contacting us</li>
            <li>We may suspend or terminate your access if you violate these terms or engage in activity that harms the service or other users</li>
            <li>Upon termination, your right to use the App ceases immediately. Data deletion will follow the process described in our <a href="/privacy" style={{ color: "#60a5fa" }}>Privacy Policy</a></li>
          </ul>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>10. Changes to These Terms</h2>
          <p style={pStyle}>
            We may update these Terms of Service from time to time. Material changes will be communicated through the App. Your continued use of Full View Studio after changes are posted constitutes acceptance of the revised terms.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>11. Governing Law</h2>
          <p style={pStyle}>
            These Terms of Service are governed by and construed in accordance with the laws of the United States. Any disputes arising from these terms or your use of the App shall be resolved through good-faith negotiation, and if necessary, binding arbitration.
          </p>
        </div>

        <div style={sectionStyle}>
          <h2 style={h2Style}>12. Contact Us</h2>
          <p style={pStyle}>
            If you have questions about these Terms of Service, contact us at:
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
