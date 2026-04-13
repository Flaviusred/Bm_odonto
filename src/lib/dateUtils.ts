export const formatDate = (dateString: string): string => {
  if (!dateString) return '';
  // Assume YYYY-MM-DD format from database
  const [year, month, day] = dateString.split('-');
  return `${month}-${day}-${year}`;
};

export const formatDateDDMMYYYY = (dateString: string): string => {
  if (!dateString) return '';
  // Assume YYYY-MM-DD format from database
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year}`;
};

export const parseDate = (dateString: string): Date => {
  // Parse YYYY-MM-DD as local time
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const formatDateLocal = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
