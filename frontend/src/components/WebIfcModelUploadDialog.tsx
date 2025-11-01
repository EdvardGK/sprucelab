/**
 * Web-IFC Model Upload Dialog
 *
 * FLOW: Parse → Upload → View (with parsed data) → Background save
 *
 * Flow:
 * 1. User selects IFC file
 * 2. Parse with web-ifc (metadata + geometry)
 * 3. Upload to backend (file + metadata)
 * 4. Navigate to ModelWorkspace with parsed scene
 * 5. Viewer displays immediately (no re-parsing!)
 * 6. Background save geometry to DB (optional enhancement)
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import * as WebIFC from 'web-ifc'
import * as THREE from 'three'
import apiClient from '@/lib/api-client'
import { modelKeys } from '@/hooks/use-models'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Upload, FileUp } from 'lucide-react'

interface Props {
  projectId: string
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

interface ParsedMetadata {
  ifc_schema: string
  element_count: number
  storey_count: number
  system_count: number
  elements: Array<{
    guid: string
    type: string
    name?: string
    storey?: string
  }>
  storeys: string[]
}

interface ParsedData {
  metadata: ParsedMetadata
  scene: THREE.Group
}

export function WebIfcModelUploadDialog({ projectId, trigger, open: controlledOpen, onOpenChange }: Props) {
  const [internalOpen, setInternalOpen] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Use controlled state if provided, otherwise use internal state
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setOpen = onOpenChange || setInternalOpen
  const [file, setFile] = useState<File | null>(null)
  const [modelName, setModelName] = useState('')
  const [versionNumber, setVersionNumber] = useState(1)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      // Auto-fill model name from filename
      const name = selectedFile.name.replace('.ifc', '').replace('.IFC', '')
      setModelName(name)
      setError(null)
    }
  }

  const parseIfcFile = async (file: File): Promise<ParsedData> => {
    // Check file size first - Web-IFC has memory limits
    const fileSizeMB = file.size / 1024 / 1024
    console.log(`Parsing IFC file: ${fileSizeMB.toFixed(2)} MB`)

    if (fileSizeMB > 100) {
      throw new Error(
        `File too large for Web-IFC parser (${fileSizeMB.toFixed(1)}MB). ` +
        `Web-IFC has a memory limit of ~100MB. Please use a smaller file or contact support for backend parsing.`
      )
    }

    setStatus('Initializing web-ifc...')
    setProgress(5)

    // Initialize web-ifc
    const ifcApi = new WebIFC.IfcAPI()
    ifcApi.SetWasmPath('/')
    await ifcApi.Init()

    setStatus('Reading file...')
    setProgress(10)

    // Read file
    const arrayBuffer = await file.arrayBuffer()
    const data = new Uint8Array(arrayBuffer)

    setStatus('Opening IFC model...')
    setProgress(20)

    try {
      // Open model (may fail with memory error for large files)
      const modelID = ifcApi.OpenModel(data)
      const schema = ifcApi.GetModelSchema(modelID)

      // Extract metadata + geometry (one pass!)
      return await extractMetadataAndGeometry(ifcApi, modelID, schema)
    } catch (err) {
      // Handle WASM memory errors
      if (err instanceof Error &&
          (err.message.includes('memory access out of bounds') || err.message.includes('out of memory'))) {
        throw new Error(
          `File too large for Web-IFC parser. The WASM memory limit was exceeded. ` +
          `Try a smaller file or contact support for backend parsing.`
        )
      }
      throw err
    }
  }

  const extractMetadataAndGeometry = async (ifcApi: any, modelID: number, schema: string): Promise<ParsedData> => {
    setStatus('Extracting building structure...')
    setProgress(30)

    // Extract storeys
    const storeySet = new Set<string>()
    const allStoreys = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCBUILDINGSTOREY)
    for (let i = 0; i < allStoreys.size(); i++) {
      const id = allStoreys.get(i)
      const storey = ifcApi.GetLine(modelID, id)
      if (storey.Name?.value) {
        storeySet.add(storey.Name.value)
      }
    }

    setStatus('Extracting elements and geometry...')
    setProgress(40)

    // Extract metadata + geometry in ONE PASS - get ALL IFCPRODUCT elements
    const elementsMap = new Map<string, ParsedMetadata['elements'][0]>()
    const scene = new THREE.Group()

    // Get all physical elements (IFCPRODUCT is base type for all physical objects)
    const allElements = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCPRODUCT)
    const totalToExtract = allElements.size()

    console.log(`Extracting ${totalToExtract} IFC elements...`)

    let totalExtracted = 0
    let geometryExtracted = 0

    for (let i = 0; i < allElements.size(); i++) {
      const expressID = allElements.get(i)
      try {
        const element = ifcApi.GetLine(modelID, expressID)
        const guid = element.GlobalId?.value || `Unknown-${expressID}`
        const name = element.Name?.value
        const typeName = element.constructor.name

        // Store metadata (deduplicated by GUID)
        if (guid && !elementsMap.has(guid)) {
          elementsMap.set(guid, { guid, type: typeName, name })
        }

        // Try to get geometry
        const geometry = ifcApi.GetGeometry(modelID, expressID)
        if (geometry) {
          const verts = ifcApi.GetVertexArray(geometry.GetVertexData(), geometry.GetVertexDataSize())
          const indices = ifcApi.GetIndexArray(geometry.GetIndexData(), geometry.GetIndexDataSize())

          const bufferGeometry = new THREE.BufferGeometry()
          bufferGeometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
          bufferGeometry.setIndex(new THREE.Uint32BufferAttribute(indices, 1))
          bufferGeometry.computeVertexNormals()

          const color = getColorForType(typeName)
          const material = new THREE.MeshStandardMaterial({
            color,
            side: THREE.DoubleSide,
            metalness: 0.1,
            roughness: 0.8,
          })

          const mesh = new THREE.Mesh(bufferGeometry, material)
          mesh.userData = { expressID, guid, type: typeName, name }
          scene.add(mesh)
          geometryExtracted++
        }

        totalExtracted++
        if (totalExtracted % 50 === 0) {
          setProgress(40 + (totalExtracted / totalToExtract) * 55)
        }
      } catch (err) {
        // Skip elements without geometry (spatial structures, etc.)
        // console.warn(`Failed to extract element ${expressID}:`, err)
      }
    }

    console.log(`Extracted geometry for ${geometryExtracted} / ${totalToExtract} elements`)

    // Center the model
    const box = new THREE.Box3().setFromObject(scene)
    const center = box.getCenter(new THREE.Vector3())
    scene.position.sub(center)

    const elements = Array.from(elementsMap.values())

    setProgress(100)

    return {
      metadata: {
        ifc_schema: schema,
        element_count: elements.length,
        storey_count: storeySet.size,
        system_count: 0,
        elements,
        storeys: Array.from(storeySet),
      },
      scene,
    }
  }

  function getColorForType(type: string): number {
    const colorMap: Record<string, number> = {
      'IFCWALL': 0xcccccc,
      'IFCWALLSTANDARDCASE': 0xcccccc,
      'IFCSLAB': 0x888888,
      'IFCDOOR': 0x8B4513,
      'IFCWINDOW': 0x87CEEB,
      'IFCCOLUMN': 0x999999,
      'IFCBEAM': 0x999999,
      'IFCROOF': 0x8B0000,
      'IFCSTAIR': 0xD2691E,
      'IFCRAILING': 0xC0C0C0,
      'IFCFURNISHINGELEMENT': 0xDEB887,
    }
    return colorMap[type] || 0xaaaaaa
  }

  const uploadAndNavigate = async () => {
    if (!file || !modelName) {
      setError('Please select a file and enter a model name')
      return
    }

    setIsProcessing(true)
    setError(null)
    setProgress(0)

    try {
      // Parse metadata + geometry in browser
      const parsedData = await parseIfcFile(file)

      setStatus('Uploading to server...')
      setProgress(96)

      // Create FormData with file + metadata
      const formData = new FormData()
      formData.append('file', file)
      formData.append('project_id', projectId)
      formData.append('name', modelName)
      formData.append('version_number', versionNumber.toString())

      // Include parsed metadata (backend doesn't need to parse!)
      formData.append('ifc_schema', parsedData.metadata.ifc_schema)
      formData.append('element_count', parsedData.metadata.element_count.toString())
      formData.append('storey_count', parsedData.metadata.storey_count.toString())
      formData.append('system_count', parsedData.metadata.system_count.toString())
      formData.append('metadata', JSON.stringify(parsedData.metadata))

      // Upload to backend
      const response = await apiClient.post('/models/upload-with-metadata/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      const { model } = response.data

      setProgress(100)
      setStatus('Opening viewer...')
      setIsProcessing(false)

      // Refresh models list
      await queryClient.invalidateQueries({ queryKey: modelKeys.list(projectId) })
      await queryClient.invalidateQueries({ queryKey: modelKeys.lists() })

      // Navigate to ModelWorkspace with parsed scene (instant display!)
      navigate(`/models/${model.id}`, {
        state: {
          preparsedScene: parsedData.scene
        }
      })

    } catch (err: any) {
      console.error('Upload failed:', err)
      setError(err.response?.data?.error || err.message || 'Upload failed')
      setIsProcessing(false)
    }
  }

  const resetForm = () => {
    setFile(null)
    setModelName('')
    setVersionNumber(1)
    setIsProcessing(false)
    setProgress(0)
    setStatus('')
    setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen)
      if (!isOpen) resetForm()
    }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Upload className="mr-2 h-4 w-4" />
            Upload Model (Web-IFC)
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Upload IFC Model</DialogTitle>
          <DialogDescription>
            Fast upload with client-side metadata parsing. View in 3D immediately after upload.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="file">IFC File</Label>
            <div className="flex items-center gap-2">
              <Input
                id="file"
                type="file"
                accept=".ifc,.IFC"
                onChange={handleFileSelect}
                disabled={isProcessing}
              />
              {file && (
                <div className="text-sm text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </div>
              )}
            </div>
          </div>

          {/* Model Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Model Name</Label>
            <Input
              id="name"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="e.g., Building A - Architecture"
              disabled={isProcessing}
            />
          </div>

          {/* Version Number */}
          <div className="space-y-2">
            <Label htmlFor="version">Version Number</Label>
            <Input
              id="version"
              type="number"
              min={1}
              value={versionNumber}
              onChange={(e) => setVersionNumber(parseInt(e.target.value) || 1)}
              disabled={isProcessing}
            />
          </div>

          {/* Progress */}
          {isProcessing && (
            <div className="space-y-2">
              <Progress value={progress} className="w-full" />
              <p className="text-sm text-muted-foreground">
                {status} {Math.round(progress)}%
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              onClick={uploadAndNavigate}
              disabled={!file || !modelName || isProcessing}
            >
              {isProcessing ? (
                <>Uploading...</>
              ) : (
                <>
                  <FileUp className="mr-2 h-4 w-4" />
                  Upload & View
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
