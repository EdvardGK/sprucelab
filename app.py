"""
Streamlit GUI for IFC Mesh Extractor

Simple web interface for extracting 3D mesh geometry from IFC models.
"""

import streamlit as st
import json
import tempfile
from pathlib import Path
import time
import numpy as np

# Import our extractor
from ifc_mesh_extractor import IFCMeshExtractor

st.set_page_config(
    page_title="IFC Mesh Extractor",
    page_icon="🏗️",
    layout="wide"
)

# Initialize session state for persistent results
if 'extraction_complete' not in st.session_state:
    st.session_state.extraction_complete = False
if 'result_files' not in st.session_state:
    st.session_state.result_files = {}
if 'stats' not in st.session_state:
    st.session_state.stats = {}

st.title("🏗️ IFC Mesh Extractor")
st.markdown("""
Extract 3D mesh geometry from IFC models in simple, universal formats.
Upload an IFC file to extract vertices and faces in world coordinates.
""")

# Sidebar configuration
with st.sidebar:
    st.header("⚙️ Settings")

    verbose_mode = st.checkbox("Verbose logging", value=False)

    parallel_mode = st.checkbox(
        "Parallel processing",
        value=False,
        help="Use multiprocessing to speed up extraction (5-10x faster on multi-core CPUs)"
    )

    if parallel_mode:
        from multiprocessing import cpu_count
        max_workers = cpu_count()
        num_workers = st.slider(
            "Worker processes",
            min_value=2,
            max_value=max_workers,
            value=max_workers,
            help=f"Number of parallel workers (detected {max_workers} CPU cores)"
        )
    else:
        num_workers = None

    st.markdown("---")
    st.markdown("### Output Formats")
    st.markdown("✓ JSON (vertices + faces)")
    st.markdown("✓ NumPy .npz (arrays)")
    st.markdown("✓ Statistics")

    st.markdown("---")
    st.markdown("### About")
    st.markdown("""
    This tool extracts minimal geometry data:
    - GUID (element ID)
    - Type (IfcWall, IfcDuct, etc.)
    - Vertices (XYZ coordinates)
    - Faces (triangle indices)

    Use the output for:
    - Three.js visualization
    - NumPy/Plotly analysis
    - GLTF conversion
    - Point cloud sampling
    """)

# Main content
uploaded_file = st.file_uploader(
    "Upload IFC file",
    type=['ifc'],
    help="Select an IFC file to extract geometry"
)

if uploaded_file is not None:
    # Show file info
    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("File name", uploaded_file.name)
    with col2:
        file_size_mb = uploaded_file.size / (1024 * 1024)
        st.metric("File size", f"{file_size_mb:.2f} MB")
    with col3:
        st.metric("Status", "Ready")

    st.markdown("---")

    # Extract button
    if st.button("🚀 Extract Geometry", type="primary", use_container_width=True):
        # Reset session state for new extraction
        st.session_state.extraction_complete = False
        st.session_state.result_files = {}
        st.session_state.stats = {}

        # Create temporary directory for processing
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_dir_path = Path(temp_dir)

            # Save uploaded file
            ifc_path = temp_dir_path / uploaded_file.name
            with open(ifc_path, 'wb') as f:
                f.write(uploaded_file.getbuffer())

            # Create output directory
            output_dir = temp_dir_path / "output"
            output_dir.mkdir(exist_ok=True)

            # Processing status
            status_placeholder = st.empty()
            progress_bar = st.progress(0)

            try:
                # Initialize extractor
                status_placeholder.info("🔄 Initializing extractor...")
                progress_bar.progress(10)

                extractor = IFCMeshExtractor(
                    ifc_path=str(ifc_path),
                    output_dir=str(output_dir),
                    verbose=verbose_mode,
                    parallel=parallel_mode,
                    num_workers=num_workers
                )

                # Load IFC
                status_placeholder.info("📂 Loading IFC file...")
                progress_bar.progress(20)
                ifc_file = extractor.load_ifc()

                # Get elements
                status_placeholder.info("🔍 Querying elements with geometry...")
                progress_bar.progress(30)
                elements = extractor.get_elements_with_geometry(ifc_file)

                if not elements:
                    st.error("❌ No elements with geometry found in IFC file!")
                else:
                    # Show element count
                    st.info(f"Found {len(elements)} elements to process")

                    # Extract geometry
                    if parallel_mode:
                        status_placeholder.info(f"⚙️ Extracting geometry with {num_workers} parallel workers...")
                    else:
                        status_placeholder.info(f"⚙️ Extracting geometry from {len(elements)} elements...")
                    progress_bar.progress(40)

                    # Process elements (parallel or sequential)
                    if parallel_mode:
                        extracted_data = extractor._process_parallel(elements)
                    else:
                        extracted_data = extractor._process_sequential(ifc_file, elements)

                    # Export results
                    if extracted_data:
                        status_placeholder.info("💾 Exporting results...")
                        progress_bar.progress(80)

                        extractor.export_json(extracted_data)
                        extractor.export_numpy(extracted_data)
                        extractor.export_statistics()

                        # Load files into session state for persistent downloads
                        json_path = output_dir / f"{ifc_path.stem}_geometry.json"
                        npz_path = output_dir / f"{ifc_path.stem}_geometry.npz"
                        stats_path = output_dir / f"{ifc_path.stem}_stats.json"

                        st.session_state.result_files = {
                            'json': json_path.read_bytes() if json_path.exists() else None,
                            'npz': npz_path.read_bytes() if npz_path.exists() else None,
                            'stats': stats_path.read_bytes() if stats_path.exists() else None,
                            'filename': uploaded_file.name.replace('.ifc', '')
                        }
                        st.session_state.stats = extractor.stats.copy()
                        st.session_state.extraction_complete = True
                        st.session_state.sample_element = extracted_data[0] if extracted_data else None

                        progress_bar.progress(100)
                        status_placeholder.success("✅ Extraction complete!")

                    else:
                        st.error("❌ No geometry extracted successfully!")

            except Exception as e:
                status_placeholder.error(f"❌ Error during extraction: {str(e)}")
                st.exception(e)

    # Display results from session state (persists across reruns)
    if st.session_state.extraction_complete:
        st.markdown("---")
        st.subheader("📊 Extraction Statistics")

        col1, col2, col3, col4 = st.columns(4)
        with col1:
            st.metric(
                "Elements Extracted",
                st.session_state.stats.get("successful_extractions", 0),
                delta=None
            )
        with col2:
            st.metric(
                "Total Vertices",
                f"{st.session_state.stats.get('total_vertices', 0):,}"
            )
        with col3:
            st.metric(
                "Total Triangles",
                f"{st.session_state.stats.get('total_triangles', 0):,}"
            )
        with col4:
            st.metric(
                "Failed",
                st.session_state.stats.get("failed_extractions", 0),
                delta=None,
                delta_color="inverse"
            )

        # Elements by type
        st.markdown("### Elements by Type")
        type_counts = st.session_state.stats.get("element_type_counts", {})
        if type_counts:
            sorted_types = sorted(type_counts.items(), key=lambda x: x[1], reverse=True)

            col1, col2 = st.columns(2)
            mid_point = len(sorted_types) // 2

            with col1:
                for element_type, count in sorted_types[:mid_point]:
                    st.text(f"{element_type}: {count}")

            with col2:
                for element_type, count in sorted_types[mid_point:]:
                    st.text(f"{element_type}: {count}")

        # Download section (uses session state - survives page reloads!)
        st.markdown("---")
        st.subheader("⬇️ Download Results")
        st.info("💡 Download buttons will remain available even after clicking. Download all files you need!")

        col1, col2, col3 = st.columns(3)

        # JSON download
        with col1:
            if st.session_state.result_files.get('json'):
                st.download_button(
                    label="📄 Download JSON",
                    data=st.session_state.result_files['json'],
                    file_name=f"{st.session_state.result_files['filename']}_geometry.json",
                    mime="application/json",
                    key="download_json"
                )

        # NumPy download
        with col2:
            if st.session_state.result_files.get('npz'):
                st.download_button(
                    label="🔢 Download NumPy",
                    data=st.session_state.result_files['npz'],
                    file_name=f"{st.session_state.result_files['filename']}_geometry.npz",
                    mime="application/octet-stream",
                    key="download_npz"
                )

        # Statistics download
        with col3:
            if st.session_state.result_files.get('stats'):
                st.download_button(
                    label="📊 Download Stats",
                    data=st.session_state.result_files['stats'],
                    file_name=f"{st.session_state.result_files['filename']}_stats.json",
                    mime="application/json",
                    key="download_stats"
                )

        # Sample data preview
        st.markdown("---")
        st.subheader("🔍 Sample Data Preview")

        if st.session_state.sample_element:
            sample = st.session_state.sample_element

            col1, col2 = st.columns(2)
            with col1:
                st.markdown("**Element Info**")
                st.json({
                    "guid": sample["guid"],
                    "type": sample["type"],
                    "vertex_count": len(sample["vertices"]),
                    "triangle_count": len(sample["faces"])
                })

            with col2:
                st.markdown("**First 5 Vertices**")
                vertices_sample = sample["vertices"][:5].tolist()
                st.json(vertices_sample)

else:
    # Show instructions
    st.info("👆 Upload an IFC file to get started")

    st.markdown("### 📖 How to Use")
    st.markdown("""
    1. **Upload** your IFC file using the file uploader above
    2. **Configure** settings in the sidebar (optional)
    3. **Click** the Extract Geometry button
    4. **Download** the results (JSON, NumPy, or statistics)

    ### 🎯 What You Get

    **JSON Format** - Human-readable text file with:
    - Element GUIDs and types
    - Vertex coordinates (XYZ in world space)
    - Face indices (triangles)

    **NumPy Format** - Efficient binary format for Python:
    - Compressed arrays
    - Easy to load with `np.load()`
    - Perfect for analysis with matplotlib, plotly, networkx

    **Statistics** - Processing report:
    - Element counts by type
    - Total vertices/triangles
    - Success/failure rates
    """)

# Footer
st.markdown("---")
st.markdown("""
<div style='text-align: center; color: #666; font-size: 0.9em;'>
IFC Mesh Extractor | Built with Streamlit | Extracting geometry in world coordinates
</div>
""", unsafe_allow_html=True)
