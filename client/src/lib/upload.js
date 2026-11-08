import { api, errorMessage } from './api';

/**
 * Upload photos one after another (sequential on purpose: the server enforces the 3-photo limit and
 * parallel uploads would race). Never throws: returns what worked and what did not.
 * -> { uploaded, failed: [{ index, message }], images }   (images = the complaint's photo list after the last success)
 */
export async function uploadImages(complaintId, blobs) {
  const failed = [];
  let images = null;
  for (let index = 0; index < blobs.length; index += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await api.post(`/complaints/${complaintId}/images`, blobs[index], { headers: { 'Content-Type': 'image/jpeg' } });
      images = res.data.data.images;
    } catch (err) {
      failed.push({ index, message: errorMessage(err) });
    }
  }
  return { uploaded: blobs.length - failed.length, failed, images };
}
