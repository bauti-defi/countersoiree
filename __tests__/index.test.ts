import 'jest';

import * as fs from 'fs';
import * as path from 'path';

import {ethers} from 'ethers';

import {
  getMaybeFunctionForMaybeInterface,
  maybeInterfaceToFunctionIdentifier,
  getEtherscanApiUrl, fetchAbi,
} from '../src';

const {ETHERSCAN_KEY: etherscanKey} = process.env as Readonly<{
  ETHERSCAN_KEY: string;
}>;

const OPENSEA_SEAPORT_V_1_1_ADDRESS_CREATE2 = '0x00000000006c3852cbef3e08e8df289169ede581';
const OPENSEA_SEAPORT_V_1_1_FULFILL_BASIC_ORDER = /* ethers */
  'function fulfillBasicOrder(tuple(address,uint256,uint256,address,address,address,uint256,uint256,uint8,uint256,uint256,bytes32,uint256,bytes32,bytes32,uint256,tuple(uint256,address)[],bytes)) payable returns (bool)';

function loadFixture<T = unknown>({path: p}: {
  readonly path: string;
}) {
  return JSON.parse(fs.readFileSync(path.resolve('__fixtures__', `${p}.json`), 'utf-8')) as T;
}

const loadSeaportv1_1 = () => new ethers.utils.Interface(
  loadFixture({path: 'Seaport_v1_1'}),
);

describe('countersoiree', () => {
  it('seaport_v11::abi', () => {
    expect(loadSeaportv1_1()).toBeTruthy();

    [undefined, '', null]
      .forEach(maybeInterface => expect(
        getMaybeFunctionForMaybeInterface({
          abi: loadSeaportv1_1(),
          maybeInterface,
        }),
      ).toBe(false),
    );

    expect(
      maybeInterfaceToFunctionIdentifier({
        interfaceString: OPENSEA_SEAPORT_V_1_1_FULFILL_BASIC_ORDER,
      })
    ).toBe('fulfillBasicOrder');

    expect(
      getMaybeFunctionForMaybeInterface({
        abi: loadSeaportv1_1(),
        maybeInterface: OPENSEA_SEAPORT_V_1_1_FULFILL_BASIC_ORDER,
      }),
    ).toMatchSnapshot();
  });
  it('etherscan', async () => {
      expect({
        default: getEtherscanApiUrl({}),
        mainnet: getEtherscanApiUrl({network: 'mainnet'}),
        arbitrum: getEtherscanApiUrl({network: 'arbitrum'}),
        arbitrum_rinkeby: getEtherscanApiUrl({network: 'arbitrum_rinkeby'}),
      }).toMatchSnapshot();

      expect(
        await fetchAbi({
          network: 'mainnet',
          etherscanKey,
          contractAddress: OPENSEA_SEAPORT_V_1_1_ADDRESS_CREATE2,
        }),
      ).toMatchSnapshot();
  });
});
