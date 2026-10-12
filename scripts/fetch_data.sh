#!/bin/sh
# Downloads Natural Earth 10m sources (public domain) used by scripts/build_phys.js
set -e
mkdir -p "$(dirname "$0")/../data/src"; cd "$(dirname "$0")/../data/src"
for f in ne_10m_lakes ne_10m_rivers_lake_centerlines_scale_rank ne_10m_admin_1_states_provinces; do
  curl -sSfL -o $f.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/$f.geojson
done
