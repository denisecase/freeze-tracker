function get_processed_file_path(fname) {
  const basePath = window.location.href.includes("localhost")
    ? "/root"
    : "https://raw.githubusercontent.com/denisecase/freeze-tracker/main";
  const processedFilePath = `${basePath}/data/2_processed/${fname}`;
  console.log(`Reading from file ${processedFilePath}`);
  return processedFilePath;
}

async function fetchCSVFile(filePath) {
  try {
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const fileContent = await response.text();
    return fileContent;
  } catch (error) {
    console.error('Error fetching the file:', error);
  }
}


async function get_data_frame(yearString) {
  try {
    const fn_start = "daily_temps";
    const fname = `${fn_start}_${yearString}.csv`;
    const filePath = get_processed_file_path(fname);
    console.log(`Reading to processed data file ${filePath}`);
    const csvContent = await fetchCSVFile(filePath);
    // Process the CSV content here and return a data frame
  } catch (error) {
    console.error(`Error reading data file: ${error}`);
  }
}
