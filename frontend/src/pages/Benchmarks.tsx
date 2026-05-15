import { Link } from 'react-router-dom';
import './Marketing.css';

const API_BASE = 'https://api.sprucelab.io';

type ParityRow = {
  file: string;
  authoring: string;
  mb: string;
  products: string;
  distinct: string;
  cold_ms: string;
  throughput: string;
};

const PARITY: ParityRow[] = [
  { file: 'OBF_400520_01_6_ARK.ifc',           authoring: 'Archicad (IFC2X3)',       mb: '266.7', products: '18,202',  distinct: '19', cold_ms: '657',   throughput: '406' },
  { file: 'SM_ARK.ifc',                        authoring: 'Archicad (IFC2X3)',       mb: '276.2', products: '18,979',  distinct: '19', cold_ms: '724',   throughput: '382' },
  { file: 'SM_RIVr.ifc',                       authoring: 'BSProLib (IFC4)',         mb: '347.9', products: '63,232',  distinct: '19', cold_ms: '860',   throughput: '405' },
  { file: 'Sannergata_bygg_ARK_I.ifc',         authoring: 'Revit 2025 (IFC2X3)',     mb: '362.3', products: '25,403',  distinct: '24', cold_ms: '869',   throughput: '417' },
  { file: 'BS_RIVr.ifc',                       authoring: 'Revit 2026 (IFC2X3)',     mb: '498.2', products: '2,158',   distinct: '5',  cold_ms: '1,330', throughput: '375' },
  { file: 'HI90_RIV_Skiplum_Lokal_farget.ifc', authoring: 'Revit 2025 (IFC2X3)',     mb: '522.0', products: '41,710',  distinct: '10', cold_ms: '1,310', throughput: '399' },
  { file: 'Sannergata_RIV.ifc',                authoring: 'MagiCAD for Revit (IFC2X3)', mb: '824.4', products: '143,704', distinct: '10', cold_ms: '2,812', throughput: '293' },
];

type HeadToHeadRow = {
  file: string;
  mb: string;
  products: string;
  ifcfast: string;
  ifcopenshell: string;
  speedup: string;
};

const HEAD_TO_HEAD: HeadToHeadRow[] = [
  { file: 'SM_RIBprefab.ifc',          mb: '1.6',   products: '1,420',   ifcfast: '8 ms',     ifcopenshell: '203 ms',  speedup: '25×' },
  { file: 'OBF_400520_05_6_ARK.ifc',   mb: '6.1',   products: '385',     ifcfast: '22 ms',    ifcopenshell: '449 ms',  speedup: '21×' },
  { file: 'SM_LARK.ifc',               mb: '26.9',  products: '1,570',   ifcfast: '66 ms',    ifcopenshell: '1,600 ms', speedup: '24×' },
  { file: 'SM_RIVr.ifc',               mb: '348',   products: '63,232',  ifcfast: '863 ms',   ifcopenshell: '40.5 s',  speedup: '47×' },
  { file: 'Sannergata_bygg_ARK_I.ifc', mb: '362',   products: '25,403',  ifcfast: '1.3 s',    ifcopenshell: '38.1 s',  speedup: '30×' },
  { file: 'Sannergata_RIV.ifc',        mb: '824',   products: '143,704', ifcfast: '2.5 s',    ifcopenshell: '74.5 s',  speedup: '30×' },
];

export default function Benchmarks() {
  return (
    <div className="mkt-root">
      <div className="mkt-frame">
        <header className="mkt-header">
          <Link to="/" className="mkt-wordmark">Sprucelab</Link>
          <nav className="mkt-nav" aria-label="Marketing">
            <Link to="/agents" className="mkt-nav-link">Agents</Link>
            <a href={`${API_BASE}/llms.txt`} className="mkt-nav-link" target="_blank" rel="noreferrer">llms.txt</a>
            <a href={`${API_BASE}/api/capabilities/`} className="mkt-nav-link" target="_blank" rel="noreferrer">Capabilities</a>
            <Link to="/" className="mkt-cta">Apply for access</Link>
          </nav>
        </header>

        <main className="mkt-main">
          <section className="mkt-hero">
            <span className="mkt-tag">Benchmarks · ifcfast 0.1.0</span>
            <h1 className="mkt-heading">25–47× faster than the script your agent would write.</h1>
            <p className="mkt-lede">
              Sprucelab's IFC extraction layer is powered by <a href="https://github.com/EdvardGK/ifcfast" className="mkt-inline-link" target="_blank" rel="noreferrer">ifcfast</a>,
              an MIT-licensed Rust+Python parser audited against ifcopenshell on
              seven production IFCs spanning Archicad, Revit, BSProLib, and
              MagiCAD exports. Below: the numbers, with the caveat stated
              plainly.
            </p>
            <div className="mkt-callout">
              <span className="mkt-callout-tag">Scope of the claim</span>
              <p className="mkt-callout-body">
                The measured speedup is on <strong>tier-1 parse</strong> — opening
                the model, listing products, walking the spatial hierarchy, and
                extracting psets, quantities, materials, and classifications.
                Full geometry kernels (boolean clipping, advanced BREP) are
                still dominated by <code>ifcopenshell.geom</code>; ifcfast does
                not replace that path yet. The 25–47× is the cold-start
                indexing layer agents care about, not end-to-end QTO.
              </p>
            </div>
          </section>

          <section className="mkt-section" aria-label="Head-to-head vs ifcopenshell">
            <h2 className="mkt-section-title">Head-to-head: ifcfast vs ifcopenshell</h2>
            <p className="mkt-lede">
              Identical logical task on identical hardware (Linux x86_64, Python
              3.11): open the file, walk products, materialise tier-1 metadata.
            </p>
            <div className="mkt-table-wrap">
              <table className="mkt-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th className="mkt-num">Size (MB)</th>
                    <th className="mkt-num">Products</th>
                    <th className="mkt-num">ifcfast</th>
                    <th className="mkt-num">ifcopenshell</th>
                    <th className="mkt-num">Speedup</th>
                  </tr>
                </thead>
                <tbody>
                  {HEAD_TO_HEAD.map((row) => (
                    <tr key={row.file}>
                      <td className="mkt-file">{row.file}</td>
                      <td className="mkt-num">{row.mb}</td>
                      <td className="mkt-num">{row.products}</td>
                      <td className="mkt-num">{row.ifcfast}</td>
                      <td className="mkt-num">{row.ifcopenshell}</td>
                      <td className="mkt-num-emph">{row.speedup}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mkt-section" aria-label="Parity audit across exporters">
            <h2 className="mkt-section-title">Parity audit — 7 files, 5 exporters, byte-identical output</h2>
            <p className="mkt-lede">
              Cold parse timings on production IFCs from real Norwegian AEC
              projects. All seven files passed byte-identical output checks
              against ifcopenshell (psets, quantities, materials, classifications
              compared via dataframe equality on 234,000+ products).
            </p>
            <div className="mkt-table-wrap">
              <table className="mkt-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Authoring tool</th>
                    <th className="mkt-num">Size (MB)</th>
                    <th className="mkt-num">Products</th>
                    <th className="mkt-num">Distinct types</th>
                    <th className="mkt-num">Cold parse (ms)</th>
                    <th className="mkt-num">Throughput (MB/s)</th>
                  </tr>
                </thead>
                <tbody>
                  {PARITY.map((row) => (
                    <tr key={row.file}>
                      <td className="mkt-file">{row.file}</td>
                      <td>{row.authoring}</td>
                      <td className="mkt-num">{row.mb}</td>
                      <td className="mkt-num">{row.products}</td>
                      <td className="mkt-num">{row.distinct}</td>
                      <td className="mkt-num">{row.cold_ms}</td>
                      <td className="mkt-num">{row.throughput}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mkt-section" aria-label="Hot-path cache">
            <h2 className="mkt-section-title">And after the first read, it's silly fast.</h2>
            <p className="mkt-lede">
              ifcfast persists a parquet-backed index keyed by{' '}
              <code>SHA256(size + 4 MB head + 4 MB tail)</code>. Subsequent
              opens of the same model take under 100 ms on a 200 MB IFC. For an
              agent running an iterative classification loop, this is the
              difference between "wait twenty seconds per turn" and "instant
              feedback".
            </p>
            <div className="mkt-callout">
              <span className="mkt-callout-tag">Hot cache, 200 MB IFC</span>
              <p className="mkt-callout-body">
                Cold parse: 657 ms · Hot reload from parquet: <strong>65 ms</strong> · On-disk size: 2.4 MB (zstd-compressed).
              </p>
            </div>
          </section>

          <section className="mkt-section" aria-label="Limits and roadmap">
            <h2 className="mkt-section-title">What ifcfast does not do yet</h2>
            <p className="mkt-lede">
              Stated plainly so you can decide whether tier-1 indexing is the
              part of the pipeline you care about.
            </p>
            <ul style={{
              margin: 0, padding: 0, listStyle: 'none', display: 'grid',
              gap: '8px', color: 'var(--mkt-ink-mute)',
              fontSize: 'clamp(14px, 1.1vw, 16px)', lineHeight: 1.55,
            }}>
              <li>— Read-only. No IFC writing yet.</li>
              <li>— No schema validation. Use ifcopenshell or buildingSMART validators for that.</li>
              <li>— <code>IfcBooleanClippingResult</code> not tessellated (walls with openings render gross, not net).</li>
              <li>— Limited NURBS / advanced BREP coverage (~0.5% of typical elements).</li>
              <li>— Property variants beyond <code>IfcPropertySingleValue</code> are skipped (~90% coverage typical).</li>
            </ul>
          </section>
        </main>

        <footer className="mkt-footer">
          <div>sprucelab.io / benchmarks</div>
          <div className="mkt-footer-links">
            <a href="https://github.com/EdvardGK/ifcfast" className="mkt-footer-link" target="_blank" rel="noreferrer">github.com/EdvardGK/ifcfast</a>
            <a href="https://pypi.org/project/ifcfast/" className="mkt-footer-link" target="_blank" rel="noreferrer">pypi.org/project/ifcfast</a>
            <Link to="/agents" className="mkt-footer-link">agents</Link>
            <a href="mailto:hi@sprucelab.io" className="mkt-footer-link">hi@sprucelab.io</a>
          </div>
        </footer>
      </div>
    </div>
  );
}
