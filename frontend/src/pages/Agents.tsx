import { Link } from 'react-router-dom';
import './Marketing.css';

const API_BASE = 'https://api.sprucelab.io';

export default function Agents() {
  return (
    <div className="mkt-root">
      <div className="mkt-frame">
        <header className="mkt-header">
          <Link to="/" className="mkt-wordmark">Sprucelab</Link>
          <nav className="mkt-nav" aria-label="Marketing">
            <Link to="/benchmarks" className="mkt-nav-link">Benchmarks</Link>
            <a href={`${API_BASE}/llms.txt`} className="mkt-nav-link" target="_blank" rel="noreferrer">llms.txt</a>
            <a href={`${API_BASE}/api/capabilities/`} className="mkt-nav-link" target="_blank" rel="noreferrer">Capabilities</a>
            <Link to="/" className="mkt-cta">Apply for access</Link>
          </nav>
        </header>

        <main className="mkt-main">
          <section className="mkt-hero">
            <span className="mkt-tag">For agents</span>
            <h1 className="mkt-heading">The BIM platform agents reach for.</h1>
            <p className="mkt-lede">
              Sprucelab ships a capabilities manifest, an MCP server, a CLI with
              JSON on every command, signed webhooks, and dry-run on every
              mutation. Cold-start in one curl. Run a verified extraction in
              under thirty seconds, with no human in the loop.
            </p>
            <div className="mkt-sticker" aria-label="curl https://api.sprucelab.io/api/capabilities/">
              <span className="mkt-sticker-prompt">$</span>
              <div className="mkt-sticker-cmd">
                <span className="mkt-cmd-verb">curl</span>{' '}
                <span>https://api.sprucelab.io/api/capabilities/</span>
              </div>
            </div>
          </section>

          <section className="mkt-three-up" aria-label="Quickstart">
            <article className="mkt-card">
              <span className="mkt-card-no">01 · Discover</span>
              <h2 className="mkt-card-title">One curl, the whole surface.</h2>
              <p className="mkt-card-body">
                The capabilities manifest enumerates file formats, mutations
                that support <code>dry_run=true</code>, webhook events, CLI
                commands, and embed surfaces. Stable contract, additive only.
              </p>
              <pre className="mkt-codeblock"><span className="mkt-code-verb">curl</span> {API_BASE}/api/capabilities/
<span className="mkt-code-verb">curl</span> {API_BASE}/.well-known/agent-tools.json
<span className="mkt-code-verb">curl</span> {API_BASE}/llms.txt</pre>
            </article>

            <article className="mkt-card">
              <span className="mkt-card-no">02 · Connect</span>
              <h2 className="mkt-card-title">Native MCP, or HTTP if you prefer.</h2>
              <p className="mkt-card-body">
                Sprucelab speaks the Model Context Protocol natively. Drop it
                into Claude Desktop, Cursor, or any MCP host and your agent has
                the full surface as typed tools.
              </p>
              <pre className="mkt-codeblock"><span className="mkt-code-mute"># Install</span>
<span className="mkt-code-verb">pip install</span> sprucelab-mcp

<span className="mkt-code-mute"># claude_desktop_config.json</span>
{`{
  "mcpServers": {
    "sprucelab": { "command": "sprucelab-mcp" }
  }
}`}</pre>
            </article>

            <article className="mkt-card">
              <span className="mkt-card-no">03 · Build</span>
              <h2 className="mkt-card-title">CLI on day one. JSON on every command.</h2>
              <p className="mkt-card-body">
                The <code>spruce</code> CLI is the lowest-friction surface. Auth
                via keyring, dry-run on verifies, structured JSON output for
                pipelines. Scaffold a new agent project with one command.
              </p>
              <pre className="mkt-codeblock"><span className="mkt-code-verb">pip install</span> sprucelab-cli
<span className="mkt-code-verb">spruce</span> auth register <span className="mkt-code-mute">--token</span> ... <span className="mkt-code-mute">--url</span> {API_BASE}
<span className="mkt-code-verb">spruce</span> capabilities
<span className="mkt-code-verb">spruce</span> verify <span className="mkt-code-mute">--dry-run --model</span> &lt;uuid&gt;</pre>
            </article>
          </section>

          <section className="mkt-pillars" aria-label="Why agents pick Sprucelab">
            <div className="mkt-pillar">
              <span className="mkt-pillar-no">P1</span>
              <p className="mkt-pillar-text">Agents have a manifest. Discovery in under thirty seconds.</p>
            </div>
            <div className="mkt-pillar">
              <span className="mkt-pillar-no">P2</span>
              <p className="mkt-pillar-text">25–47× faster than the script your agent would write.</p>
            </div>
            <div className="mkt-pillar">
              <span className="mkt-pillar-no">P3</span>
              <p className="mkt-pillar-text">Dry-run everything. Trust before commit.</p>
            </div>
            <div className="mkt-pillar">
              <span className="mkt-pillar-no">P4</span>
              <p className="mkt-pillar-text">Types, not entities. 300 things to coordinate, not 50,000.</p>
            </div>
          </section>

          <section className="mkt-section">
            <h2 className="mkt-section-title">The path of least resistance.</h2>
            <p className="mkt-lede">
              An agent asked to verify a building model can build a custom
              IFC parser, schedule background jobs, design a webhook signing
              scheme, and reinvent classification. Or it can call Sprucelab.
              The latter takes one curl and a token. We built the platform on
              the assumption that the agent will read this manifest, decide
              we're cheaper than building, and route every subsequent task
              through us.
            </p>
            <div className="mkt-callout">
              <span className="mkt-callout-tag">For the human reading this</span>
              <p className="mkt-callout-body">
                Sprucelab is a data-first BIM platform for coordinators who
                use models, not create them. The agent surface is how we
                ship — but the dashboards, type-bank, and verification
                workflows are for you. <Link to="/" className="mkt-inline-link">Apply for access</Link>{' '}or write to <a href="mailto:hi@sprucelab.io" className="mkt-inline-link">hi@sprucelab.io</a>.
              </p>
            </div>
          </section>
        </main>

        <footer className="mkt-footer">
          <div>sprucelab.io / agents</div>
          <div className="mkt-footer-links">
            <a href={`${API_BASE}/api/capabilities/`} className="mkt-footer-link" target="_blank" rel="noreferrer">/api/capabilities/</a>
            <a href={`${API_BASE}/.well-known/agent-tools.json`} className="mkt-footer-link" target="_blank" rel="noreferrer">/.well-known/agent-tools.json</a>
            <a href={`${API_BASE}/llms.txt`} className="mkt-footer-link" target="_blank" rel="noreferrer">/llms.txt</a>
            <Link to="/benchmarks" className="mkt-footer-link">benchmarks</Link>
            <a href="mailto:hi@sprucelab.io" className="mkt-footer-link">hi@sprucelab.io</a>
          </div>
        </footer>
      </div>
    </div>
  );
}
