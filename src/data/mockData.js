export const mockValidationReport = {
  modelName: '',
  fileSize: '2.4 MB',
  triangleCount: 48234,
  vertexCount: 24118,
  analysisTime: '3.2s',
  overallScore: 72,
  printabilityScore: 68,
  summary: {
    critical: 2,
    medium: 3,
    low: 2,
    passed: 18,
    total: 25
  },
  issues: [
    {
      id: 1,
      type: 'Non-Manifold Edges',
      severity: 'critical',
      description: 'Found 12 non-manifold edges near the base connection points. These edges share more than 2 faces, making the mesh unprintable in its current state.',
      location: 'Base — Vertices 1024–1036',
      suggestedFix: 'Merge overlapping vertices and recalculate normals at the affected edges. Consider using mesh repair tools to close gaps.',
      affectedTriangles: 24
    },
    {
      id: 2,
      type: 'Inverted Normals',
      severity: 'critical',
      description: '8 triangles have inverted face normals on the inner cavity wall. This will cause slicing errors and potential print failures.',
      location: 'Inner Cavity — Faces 4820–4828',
      suggestedFix: 'Flip the normals of the affected faces to ensure consistent outward orientation across the entire mesh.',
      affectedTriangles: 8
    },
    {
      id: 3,
      type: 'Thin Wall Detection',
      severity: 'medium',
      description: 'Wall thickness drops below 0.8mm in 3 regions, which is below the minimum recommended thickness for FDM printing.',
      location: 'Upper Section — Region A3',
      suggestedFix: 'Increase wall thickness to at least 1.2mm in the affected regions or consider using SLA printing for finer detail.',
      affectedTriangles: 156
    },
    {
      id: 4,
      type: 'Overhanging Geometry',
      severity: 'medium',
      description: 'Detected overhangs exceeding 55° without support structures in 2 locations. May result in drooping or failed prints.',
      location: 'Arm Extensions — Both Sides',
      suggestedFix: 'Add support structures or redesign the overhang angle to 45° or less. Consider splitting the model for multi-part printing.',
      affectedTriangles: 89
    },
    {
      id: 5,
      type: 'Floating Geometry',
      severity: 'medium',
      description: 'Small disconnected mesh island detected (14 triangles). This fragment is not attached to the main body and will not print correctly.',
      location: 'Near Top Surface — Island Group',
      suggestedFix: 'Remove the floating geometry or bridge it to the main mesh body. Verify the design intent for this region.',
      affectedTriangles: 14
    },
    {
      id: 6,
      type: 'Degenerate Triangles',
      severity: 'low',
      description: 'Found 5 degenerate (zero-area) triangles that could cause minor slicing artifacts. Generally non-critical for most printers.',
      location: 'Scattered — Various Faces',
      suggestedFix: 'Run a mesh cleanup pass to remove zero-area triangles. Most slicers handle these automatically.',
      affectedTriangles: 5
    },
    {
      id: 7,
      type: 'Sub-optimal Triangle Density',
      severity: 'low',
      description: 'Triangle density varies significantly across the model surface. Some areas have 10x more triangles than needed, increasing file size unnecessarily.',
      location: 'Flat Surfaces — Bottom Plate',
      suggestedFix: 'Apply mesh decimation to reduce triangle count on flat surfaces while preserving detail on curved areas. Target 30% reduction.',
      affectedTriangles: 3200
    }
  ],
  materialEstimates: {
    volume: '45.2 cm³',
    weight: '54.2 g (PLA)',
    printTime: '4h 32m',
    materialCost: '$3.25'
  },
  dimensions: {
    x: '120.5 mm',
    y: '85.3 mm',
    z: '95.8 mm',
    boundingBox: '120.5 × 85.3 × 95.8 mm'
  }
};

export const serviceTypes = [
  { id: 'fix-only', label: 'Model Repair Only', description: 'We fix all detected issues and return the repaired file', price: '$29' },
  { id: 'fix-print-fdm', label: 'Repair + FDM Print', description: 'Fix issues and print using Fused Deposition Modeling', price: '$49+' },
  { id: 'fix-print-sla', label: 'Repair + SLA Print', description: 'Fix issues and print using Stereolithography for high detail', price: '$79+' },
  { id: 'fix-print-sls', label: 'Repair + SLS Print', description: 'Fix issues and print using Selective Laser Sintering', price: '$129+' },
];
