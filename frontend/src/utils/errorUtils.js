export function getErrorMessage(error, fallbackMessage = 'Something went wrong. Please try again.') {
  if (!error) {
    return fallbackMessage;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error.responseData?.message) {
    return error.responseData.message;
  }

  if (error.message) {
    return error.message;
  }

  return fallbackMessage;
}
