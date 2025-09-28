import { MapContainer, Marker, Popup, TileLayer, useMap, LayersControl } from 'react-leaflet'
import { useEffect, useMemo, useRef } from 'react'
import L, { LatLngBoundsExpression } from 'leaflet'
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


function ResizeOnPropChange({ dep, bounds }: { dep: unknown; bounds?: LatLngBoundsExpression }) {
  const map = useMap()
  // Invalidate size when dependency (like container size toggle) changes
  useEffect(() => {
    const id = setTimeout(() => {
      map.invalidateSize()
      if (bounds) {
        const fitBounds = L.latLngBounds(bounds)
        const options: L.FitBoundsOptions = { padding: [20, 20] }
        map.fitBounds(fitBounds, options)
      }
    }, 0)
    return () => clearTimeout(id)
  }, [map, dep, bounds])
  return null
}

function RecenterOnChange({ position, zoom, recenterKey, bounds }: { position: [number, number]; zoom: number; recenterKey?: unknown; bounds?: LatLngBoundsExpression }) {
  const map = useMap()
  const lastCenter = useRef<[number, number] | null>(null)
  const lastZoom = useRef<number | null>(null)
  const lastKey = useRef<unknown>(null)
  const lastBounds = useRef<L.LatLngBounds | null>(null)
  useEffect(() => {
    if (bounds) {
      const targetBounds = L.latLngBounds(bounds)
      const keyChanged = lastKey.current !== recenterKey
      const boundsChanged = !lastBounds.current || !lastBounds.current.equals(targetBounds)
      if (boundsChanged || keyChanged) {
        const options: L.FitBoundsOptions = { padding: [20, 20] }
        map.fitBounds(targetBounds, options)
        lastBounds.current = targetBounds
        lastKey.current = recenterKey
      }
      return
    }

    const centerChanged =
      !lastCenter.current ||
      lastCenter.current[0] !== position[0] ||
      lastCenter.current[1] !== position[1]
    const zoomChanged = lastZoom.current !== zoom
    const keyChanged = lastKey.current !== recenterKey

    if (centerChanged || zoomChanged || keyChanged) {
      map.setView(position, zoom)
      lastCenter.current = position
      lastZoom.current = zoom
      lastKey.current = recenterKey
      lastBounds.current = null
    }
  }, [map, position, zoom, recenterKey, bounds])
  return null
}

type MapViewProps = {
  lat: number
  lng: number
  label?: string
  isLarge?: boolean
  resizeKey?: unknown
  zoomLevel?: number
  minZoom?: number
  maxZoom?: number
  recenterKey?: unknown
  centerOverride?: [number, number]
  boundsOverride?: LatLngBoundsExpression
}

export function MapView({
  lat,
  lng,
  label,
  isLarge,
  resizeKey,
  zoomLevel,
  minZoom,
  maxZoom,
  recenterKey,
  centerOverride,
  boundsOverride,
}: MapViewProps) {
  const position = useMemo<[number, number]>(() => [lat, lng], [lat, lng])
  const center = useMemo<[number, number]>(() => {
    if (centerOverride) return centerOverride
    if (boundsOverride) {
      const bounds = L.latLngBounds(boundsOverride)
      const { lat: bLat, lng: bLng } = bounds.getCenter()
      return [bLat, bLng]
    }
    return position
  }, [centerOverride, boundsOverride, position])
  const zoom = zoomLevel ?? 11
  return (
    <div style={{ height: '100%', width: '100%' }}>
      <MapContainer
        center={center}
        zoom={zoom}
        minZoom={minZoom}
        maxZoom={maxZoom}
        style={{ height: '100%', width: '100%', flex: 1 }}
        scrollWheelZoom={true}
      >
        <RecenterOnChange position={center} zoom={zoom} recenterKey={recenterKey} bounds={boundsOverride} />
        <ResizeOnPropChange dep={resizeKey ?? isLarge} bounds={boundsOverride} />
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

        </LayersControl>
        <Marker position={position}>
          {label && <Popup>{label}</Popup>}
        </Marker>
      </MapContainer>
    </div>
  )
}


