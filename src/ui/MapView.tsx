import { MapContainer, Marker, Popup, TileLayer, Polygon, useMap, LayersControl } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix default marker icon paths in bundlers
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})
L.Marker.prototype.options.icon = DefaultIcon

// Rough boundary of Yellowstone National Park (approximate, simplified)
const YELLOWSTONE_POLY: [number, number][] = [
  [44.742, -111.202], [44.771, -111.050], [44.893, -110.997], [44.968, -110.818],
  [45.026, -110.676], [44.997, -110.530], [44.934, -110.428], [44.845, -110.379],
  [44.737, -110.366], [44.604, -110.332], [44.498, -110.322], [44.424, -110.254],
  [44.387, -110.110], [44.395, -109.969], [44.459, -109.842], [44.567, -109.787],
  [44.677, -109.791], [44.763, -109.821], [44.833, -109.895], [44.920, -109.966],
  [45.016, -110.028], [45.055, -110.147], [45.034, -110.312], [45.006, -110.493],
  [44.969, -110.654], [44.892, -110.820], [44.836, -110.949], [44.773, -111.080],
  [44.713, -111.173], [44.742, -111.202],
]

function ResizeOnPropChange({ dep }: { dep: unknown }) {
  const map = useMap()
  // Invalidate size when dependency (like container size toggle) changes
  // and re-center to keep marker in view.
  setTimeout(() => {
    map.invalidateSize()
  }, 0)
  return null
}

export function MapView({ lat, lng, label, isLarge, resizeKey }: { lat: number; lng: number; label?: string; isLarge?: boolean; resizeKey?: unknown }) {
  const position: [number, number] = [lat, lng]
  return (
    <div style={{ height: '100%', width: '100%' }}>
      <MapContainer center={position} zoom={11} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
        <ResizeOnPropChange dep={resizeKey ?? isLarge} />
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="OpenStreetMap">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer name="OpenTopoMap">
            <TileLayer
              attribution='Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="https://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)'
              url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer name="Esri World Street">
            <TileLayer
              attribution='Tiles &copy; Esri — Source: Esri, HERE, Garmin, FAO, NOAA, USGS, &copy; OpenStreetMap contributors, and the GIS User Community'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer name="Esri World Topo">
            <TileLayer
              attribution='Tiles &copy; Esri — Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, IGN, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer name="Esri World Imagery">
            <TileLayer
              attribution='Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer name="USGS Topo">
            <TileLayer
              attribution='Tiles courtesy of the U.S. Geological Survey'
              url="https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}"
            />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer name="Carto Voyager">
            <TileLayer
              attribution='&copy; OpenStreetMap contributors &copy; CARTO'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
            />
          </LayersControl.BaseLayer>

          <LayersControl.Overlay checked name="Yellowstone boundary">
            <Polygon positions={YELLOWSTONE_POLY} pathOptions={{ color: '#ffae00', weight: 3, dashArray: '6 4', fillOpacity: 0 }} />
          </LayersControl.Overlay>
        </LayersControl>
        <Marker position={position}>
          {label && <Popup>{label}</Popup>}
        </Marker>
      </MapContainer>
    </div>
  )
}


