function getProcessedFilePath(fname) {
  const basePath = window.location.href.includes("localhost")
    ? "/root"
    : "https://raw.githubusercontent.com/denisecase/freeze-tracker/main";
  const processedFilePath = `${basePath}/data/2_processed/${fname}`;
  console.log(`Reading from file ${processedFilePath}`);
  return processedFilePath;
}
