const LocalStorageDriver = require('./drivers/LocalStorageDriver');
const S3StorageDriver = require('./drivers/S3StorageDriver');
const { getRuntimeConfig } = require('../../config/runtime');

function createStorageService(runtimeConfig = getRuntimeConfig()) {
  const { storage } = runtimeConfig;

  if (storage.driver === 's3') {
    const driver = new S3StorageDriver(storage.s3);
    return {
      driverName: driver.driverName,
      putBuffer: driver.putBuffer.bind(driver),
      putFile: driver.putFile.bind(driver),
      getBuffer: driver.getBuffer.bind(driver),
      deleteObject: driver.deleteObject.bind(driver),
      materializeToFile: driver.materializeToFile.bind(driver)
    };
  }

  const driver = new LocalStorageDriver(storage.local.rootPath);
  return {
    driverName: driver.driverName,
    putBuffer: driver.putBuffer.bind(driver),
    putFile: driver.putFile.bind(driver),
    getBuffer: driver.getBuffer.bind(driver),
    deleteObject: driver.deleteObject.bind(driver),
    materializeToFile: driver.materializeToFile.bind(driver)
  };
}

let singletonStorageService = null;

function getStorageService() {
  if (!singletonStorageService) {
    singletonStorageService = createStorageService();
  }

  return singletonStorageService;
}

module.exports = {
  createStorageService,
  getStorageService
};
