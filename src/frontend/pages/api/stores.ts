// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import InstrumentationMiddleware from '../../utils/telemetry/InstrumentationMiddleware';

export type Store = { id: string; name: string; city: string; state: string; metro: string };
type TResponse = { stores: Store[] };

const handler = ({ method }: NextApiRequest, res: NextApiResponse<TResponse | string>) => {
  if (method !== 'GET') return res.status(405).end();
  const file = path.join(process.cwd(), 'public', 'stores.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as TResponse;
  return res.status(200).json(data);
};

export default InstrumentationMiddleware(handler);
