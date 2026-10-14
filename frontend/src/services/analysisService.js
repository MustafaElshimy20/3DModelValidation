import { postMultipart } from './apiClient';

export async function analyzeModel(file, options = {}) {
  const formData = new FormData();
  formData.append('file', file);
  return postMultipart('/analyze-model', formData, options);
}
