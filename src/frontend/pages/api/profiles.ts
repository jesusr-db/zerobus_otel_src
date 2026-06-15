// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0

import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import InstrumentationMiddleware from '../../utils/telemetry/InstrumentationMiddleware';

export type Profile = { id: string; name: string; member_id: string | null; tier: string; home_store_id: string; zip: string | null };
type TResponse = { profiles: Profile[] };

const handler = ({ method }: NextApiRequest, res: NextApiResponse<TResponse | string>) => {
  if (method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const file = path.join(process.cwd(), 'public', 'profiles.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as TResponse;
  return res.status(200).json(data);
};

export default InstrumentationMiddleware(handler);
