/**
 * Security Documentation Page
 * Client-facing documentation explaining security measures.
 *
 * Purpose: Allow enterprise clients to review security practices
 * before authorizing OAuth connections.
 */

import { useState } from 'react';
import {
  Shield,
  Lock,
  Key,
  Eye,
  FileText,
  Server,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Database,
  RefreshCw,
  Trash2
} from 'lucide-react';

const cardStyle = {
  background: "#1E1E1E",
  borderRadius: "12px",
  border: "1px solid #333",
  marginBottom: "16px",
  overflow: "hidden",
};

const sectionHeaderStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "20px 24px",
  cursor: "pointer",
  userSelect: "none",
};

const sectionContentStyle = {
  padding: "0 24px 24px",
  borderTop: "1px solid #333",
};

const bulletStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: "12px",
  marginBottom: "16px",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "13px",
};

const thStyle = {
  textAlign: "left",
  padding: "12px 16px",
  background: "#252525",
  fontWeight: "600",
  borderBottom: "1px solid #333",
};

const tdStyle = {
  padding: "12px 16px",
  borderBottom: "1px solid #2a2a2a",
  verticalAlign: "top",
};

function ExpandableSection({ icon: Icon, iconColor, title, subtitle, children, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div style={cardStyle}>
      <div
        style={sectionHeaderStyle}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <Icon size={22} style={{ color: iconColor }} />
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: "600", margin: 0 }}>{title}</h3>
            {subtitle && (
              <p style={{ fontSize: "12px", color: "#9E9E9E", margin: "4px 0 0" }}>{subtitle}</p>
            )}
          </div>
        </div>
        {isOpen ? <ChevronDown size={20} style={{ color: "#9E9E9E" }} /> : <ChevronRight size={20} style={{ color: "#9E9E9E" }} />}
      </div>
      {isOpen && (
        <div style={sectionContentStyle}>
          {children}
        </div>
      )}
    </div>
  );
}

export default function SecurityDocs() {
  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
        <Shield size={28} style={{ color: "#22c55e" }} />
        <div>
          <h2 style={{ fontSize: "22px", fontWeight: "700", margin: 0 }}>Security Documentation</h2>
          <p style={{ fontSize: "13px", color: "#9E9E9E", margin: "4px 0 0" }}>
            How we protect your data and credentials
          </p>
        </div>
      </div>

      {/* Overview Card */}
      <div style={{
        ...cardStyle,
        background: "linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%)",
        border: "1px solid rgba(34, 197, 94, 0.3)",
        padding: "24px",
      }}>
        <h3 style={{ fontSize: "16px", fontWeight: "600", margin: "0 0 16px", color: "#22c55e" }}>
          Security at a Glance
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          {[
            { icon: Lock, label: "AES-256-GCM Encryption", desc: "Industry-standard encryption" },
            { icon: Key, label: "PKCE OAuth Flow", desc: "Prevents code interception" },
            { icon: Server, label: "Server-Side Exchange", desc: "Secrets never in browser" },
            { icon: Eye, label: "Read-Only Access", desc: "Cannot modify your data" },
            { icon: FileText, label: "Audit Logging", desc: "All actions recorded" },
            { icon: Database, label: "Isolated Storage", desc: "Per-user data isolation" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
              <item.icon size={18} style={{ color: "#22c55e", flexShrink: 0, marginTop: "2px" }} />
              <div>
                <div style={{ fontWeight: "600", fontSize: "13px", marginBottom: "2px" }}>{item.label}</div>
                <div style={{ fontSize: "11px", color: "#9E9E9E" }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* OAuth Security */}
      <ExpandableSection
        icon={Key}
        iconColor="#a78bfa"
        title="OAuth Security"
        subtitle="How we authenticate with YouTube"
        defaultOpen={true}
      >
        <div style={bulletStyle}>
          <CheckCircle2 size={18} style={{ color: "#22c55e", flexShrink: 0, marginTop: "2px" }} />
          <div>
            <div style={{ fontWeight: "600", marginBottom: "6px" }}>PKCE (Proof Key for Code Exchange)</div>
            <p style={{ fontSize: "13px", color: "#9E9E9E", margin: 0, lineHeight: "1.6" }}>
              We use PKCE with SHA-256 code challenges as specified in RFC 7636. This prevents authorization
              code interception attacks, even if an attacker intercepts the OAuth redirect.
            </p>
          </div>
        </div>

        <div style={bulletStyle}>
          <CheckCircle2 size={18} style={{ color: "#22c55e", flexShrink: 0, marginTop: "2px" }} />
          <div>
            <div style={{ fontWeight: "600", marginBottom: "6px" }}>Server-Side Token Exchange</div>
            <p style={{ fontSize: "13px", color: "#9E9E9E", margin: 0, lineHeight: "1.6" }}>
              Authorization codes are exchanged for tokens entirely server-side. Your browser never sees
              the client secret or the raw tokens. The code verifier is stored server-side and never
              transmitted to the client.
            </p>
          </div>
        </div>

        <div style={bulletStyle}>
          <CheckCircle2 size={18} style={{ color: "#22c55e", flexShrink: 0, marginTop: "2px" }} />
          <div>
            <div style={{ fontWeight: "600", marginBottom: "6px" }}>Minimal Scope</div>
            <p style={{ fontSize: "13px", color: "#9E9E9E", margin: 0, lineHeight: "1.6" }}>
              We request only <code style={{ background: "#333", padding: "2px 6px", borderRadius: "4px" }}>youtube.readonly</code> access.
              This means we can view your channel data but cannot modify anything, upload videos,
              or access private information.
            </p>
          </div>
        </div>
      </ExpandableSection>

      {/* Data Encryption */}
      <ExpandableSection
        icon={Lock}
        iconColor="#f59e0b"
        title="Data Encryption"
        subtitle="How we protect stored credentials"
      >
        <div style={bulletStyle}>
          <CheckCircle2 size={18} style={{ color: "#22c55e", flexShrink: 0, marginTop: "2px" }} />
          <div>
            <div style={{ fontWeight: "600", marginBottom: "6px" }}>AES-256-GCM Encryption</div>
            <p style={{ fontSize: "13px", color: "#9E9E9E", margin: 0, lineHeight: "1.6" }}>
              All OAuth tokens are encrypted using AES-256-GCM before being stored in our database.
              This is an authenticated encryption algorithm that provides both confidentiality and
              integrity protection.
            </p>
          </div>
        </div>

        <div style={bulletStyle}>
          <CheckCircle2 size={18} style={{ color: "#22c55e", flexShrink: 0, marginTop: "2px" }} />
          <div>
            <div style={{ fontWeight: "600", marginBottom: "6px" }}>Secure Key Management</div>
            <p style={{ fontSize: "13px", color: "#9E9E9E", margin: 0, lineHeight: "1.6" }}>
              Encryption keys are stored in secure environment variables, never in code or version control.
              Keys are rotated periodically and old keys are archived for disaster recovery.
            </p>
          </div>
        </div>

        <div style={{ marginTop: "20px" }}>
          <h4 style={{ fontSize: "13px", fontWeight: "600", marginBottom: "12px" }}>What's Encrypted</h4>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Field</th>
                <th style={thStyle}>Encrypted</th>
                <th style={thStyle}>Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={tdStyle}>Access Token</td>
                <td style={tdStyle}><CheckCircle2 size={16} style={{ color: "#22c55e" }} /></td>
                <td style={tdStyle}>Used for API calls, expires in 1 hour</td>
              </tr>
              <tr>
                <td style={tdStyle}>Refresh Token</td>
                <td style={tdStyle}><CheckCircle2 size={16} style={{ color: "#22c55e" }} /></td>
                <td style={tdStyle}>Used to obtain new access tokens</td>
              </tr>
              <tr>
                <td style={tdStyle}>Channel ID</td>
                <td style={tdStyle}>-</td>
                <td style={tdStyle}>Public identifier, not sensitive</td>
              </tr>
              <tr>
                <td style={tdStyle}>Channel Name</td>
                <td style={tdStyle}>-</td>
                <td style={tdStyle}>Public information, displayed in UI</td>
              </tr>
            </tbody>
          </table>
        </div>
      </ExpandableSection>

      {/* Access Controls */}
      <ExpandableSection
        icon={Eye}
        iconColor="#60a5fa"
        title="Access Controls"
        subtitle="What we can and cannot access"
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          <div>
            <h4 style={{ fontSize: "13px", fontWeight: "600", marginBottom: "12px", color: "#22c55e" }}>
              What We CAN Access
            </h4>
            <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "#9E9E9E", lineHeight: "2" }}>
              <li>Public channel information</li>
              <li>Video metadata (titles, views, etc.)</li>
              <li>Channel statistics</li>
              <li>Your email (for identification)</li>
            </ul>
          </div>
          <div>
            <h4 style={{ fontSize: "13px", fontWeight: "600", marginBottom: "12px", color: "#ef4444" }}>
              What We CANNOT Access
            </h4>
            <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "13px", color: "#9E9E9E", lineHeight: "2" }}>
              <li>Upload or modify videos</li>
              <li>Change channel settings</li>
              <li>Access private/unlisted content</li>
              <li>View revenue or financial data</li>
              <li>Manage comments or community</li>
            </ul>
          </div>
        </div>
      </ExpandableSection>

      {/* Audit Logging */}
      <ExpandableSection
        icon={FileText}
        iconColor="#22c55e"
        title="Audit Logging"
        subtitle="How we track credential usage"
      >
        <p style={{ fontSize: "13px", color: "#9E9E9E", marginBottom: "20px", lineHeight: "1.6" }}>
          Every OAuth-related action is logged for security and compliance purposes.
          Audit logs are retained for 90 days and are available to administrators upon request.
        </p>

        <h4 style={{ fontSize: "13px", fontWeight: "600", marginBottom: "12px" }}>Events We Log</h4>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Event</th>
              <th style={thStyle}>What's Recorded</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdStyle}>OAuth Initiated</td>
              <td style={tdStyle}>User ID, timestamp, IP address, user agent</td>
            </tr>
            <tr>
              <td style={tdStyle}>OAuth Success/Failure</td>
              <td style={tdStyle}>Result, channel connected, error details (if any)</td>
            </tr>
            <tr>
              <td style={tdStyle}>Token Refresh</td>
              <td style={tdStyle}>Connection ID, new expiry, success/failure</td>
            </tr>
            <tr>
              <td style={tdStyle}>Token Revoked</td>
              <td style={tdStyle}>User ID, channel disconnected, timestamp</td>
            </tr>
          </tbody>
        </table>
      </ExpandableSection>

      {/* Data Handling */}
      <ExpandableSection
        icon={Database}
        iconColor="#ec4899"
        title="Data Handling"
        subtitle="How to manage and remove your data"
      >
        <div style={bulletStyle}>
          <RefreshCw size={18} style={{ color: "#60a5fa", flexShrink: 0, marginTop: "2px" }} />
          <div>
            <div style={{ fontWeight: "600", marginBottom: "6px" }}>Token Refresh</div>
            <p style={{ fontSize: "13px", color: "#9E9E9E", margin: 0, lineHeight: "1.6" }}>
              YouTube access tokens expire every hour. We automatically refresh tokens before they expire
              to maintain uninterrupted access. You can also manually refresh tokens from the settings page.
            </p>
          </div>
        </div>

        <div style={bulletStyle}>
          <Trash2 size={18} style={{ color: "#ef4444", flexShrink: 0, marginTop: "2px" }} />
          <div>
            <div style={{ fontWeight: "600", marginBottom: "6px" }}>Disconnecting Your Account</div>
            <p style={{ fontSize: "13px", color: "#9E9E9E", margin: 0, lineHeight: "1.6" }}>
              You can disconnect your YouTube account at any time from the API Settings page.
              When you disconnect:
            </p>
            <ul style={{ margin: "8px 0 0", paddingLeft: "18px", fontSize: "13px", color: "#9E9E9E", lineHeight: "1.8" }}>
              <li>We revoke the token with Google</li>
              <li>All stored tokens are permanently deleted</li>
              <li>The disconnection is logged for audit purposes</li>
              <li>You can reconnect at any time</li>
            </ul>
          </div>
        </div>

        <div style={{
          marginTop: "20px", padding: "16px",
          background: "rgba(239, 68, 68, 0.08)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
          borderRadius: "8px"
        }}>
          <div style={{ fontWeight: "600", marginBottom: "8px", color: "#ef4444", fontSize: "13px" }}>
            You can also revoke access directly from Google
          </div>
          <p style={{ fontSize: "12px", color: "#fca5a5", margin: 0, lineHeight: "1.6" }}>
            Visit <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#fca5a5", textDecoration: "underline" }}
            >
              Google Account Permissions
            </a> to view and revoke third-party app access at any time.
          </p>
        </div>
      </ExpandableSection>

      {/* Questions Section */}
      <div style={{
        ...cardStyle,
        padding: "24px",
        background: "#1E1E1E",
      }}>
        <h3 style={{ fontSize: "16px", fontWeight: "600", margin: "0 0 16px" }}>
          Questions?
        </h3>
        <p style={{ fontSize: "13px", color: "#9E9E9E", margin: "0 0 16px", lineHeight: "1.6" }}>
          If you have questions about our security practices or need additional documentation
          for compliance review, please contact your account representative.
        </p>
        <div style={{ display: "flex", gap: "12px" }}>
          <a
            href="mailto:security@crux.media"
            style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              padding: "10px 16px", background: "#2962FF",
              border: "none", borderRadius: "8px",
              color: "#fff", fontSize: "13px", fontWeight: "600",
              textDecoration: "none"
            }}
          >
            Contact Security Team
            <ExternalLink size={14} />
          </a>
        </div>
      </div>
    </div>
  );
}
