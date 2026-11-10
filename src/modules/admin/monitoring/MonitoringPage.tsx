import React, { useState } from 'react';
import {
  Activity,
  Server,
  Layers,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Clock,
  Cpu,
  Zap,
  TrendingUp,
} from 'lucide-react';
import { usePlatformStore } from '@/stores/usePlatformStore';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { Tabs } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/common/StatCard';
import { formatNumber } from '@/utils/formatters';

export const MonitoringPage: React.FC = () => {
  const { workers, queues, jobs, retryJob, toggleWorkerStatus } = usePlatformStore();

  const [activeTab, setActiveTab] = useState('workers');

  const failedJobs = jobs.filter((j) => j.status === 'failed');

  const tabs = [
    { id: 'workers', label: 'Worker Cluster Nodes', count: workers.length },
    { id: 'queues', label: 'Inference Queues', count: queues.length },
    { id: 'failed', label: 'Failed Jobs', count: failedJobs.length },
    { id: 'allJobs', label: 'Global Job Stream', count: jobs.length },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Breadcrumbs items={[{ label: 'Admin Portal', path: '/admin/dashboard' }, { label: 'OCR Monitoring' }]} />
          <h1 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">OCR Infrastructure & Queues</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time GPU inference nodes, async queues, latency health, and failed job resolution.
          </p>
        </div>
      </div>

      {/* Cluster Health Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Cluster Nodes"
          value={`${workers.filter((w) => w.status !== 'offline').length} / ${workers.length}`}
          subtitle="Nodes Operational"
          icon={<Server className="h-5 w-5" />}
          iconBgColor="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          title="Active Queued Tasks"
          value={queues.reduce((a, b) => a + b.queuedCount, 0)}
          subtitle="Across 3 queues"
          icon={<Layers className="h-5 w-5" />}
          iconBgColor="bg-blue-50 text-blue-600"
        />
        <StatCard
          title="Avg P95 Latency"
          value="1.42s"
          change="-120ms"
          isPositive={true}
          subtitle="Real-time priority"
          icon={<Zap className="h-5 w-5" />}
          iconBgColor="bg-amber-50 text-amber-600"
        />
        <StatCard
          title="Failed Job Rate"
          value={`${((failedJobs.length / jobs.length) * 100).toFixed(1)}%`}
          subtitle={`${failedJobs.length} unresolved failures`}
          icon={<AlertTriangle className="h-5 w-5" />}
          iconBgColor="bg-rose-50 text-rose-600"
        />
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab 1: Worker Nodes */}
      {activeTab === 'workers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workers.map((worker) => (
            <Card key={worker.id} className="p-5 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs text-slate-400">{worker.ipAddress}</span>
                  <Badge
                    variant={
                      worker.status === 'online'
                        ? 'success'
                        : worker.status === 'busy'
                        ? 'warning'
                        : 'danger'
                    }
                    size="sm"
                  >
                    {worker.status}
                  </Badge>
                </div>
                <h3 className="font-bold text-sm text-slate-900">{worker.name}</h3>
                <div className="text-[11px] text-slate-500">{worker.type} • Uptime: {worker.uptime}</div>

                {worker.currentTask && (
                  <div className="mt-2 p-2 rounded bg-amber-50 border border-amber-200/60 text-[11px] text-amber-900 font-mono">
                    <span className="font-semibold block">Active Task:</span>
                    {worker.currentTask}
                  </div>
                )}
              </div>

              {/* Hardware utilization */}
              <div className="space-y-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
                <div>
                  <div className="flex justify-between text-[11px] mb-0.5">
                    <span>CPU Usage</span>
                    <span className="font-semibold">{worker.cpuUsage}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-blue-600 h-full rounded-full" style={{ width: `${worker.cpuUsage}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-0.5">
                    <span>RAM Usage</span>
                    <span className="font-semibold">{worker.memoryUsage}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${worker.memoryUsage}%` }} />
                  </div>
                </div>

                {typeof worker.gpuUsage === 'number' && (
                  <div>
                    <div className="flex justify-between text-[11px] mb-0.5">
                      <span>NVIDIA Tensor Core (GPU)</span>
                      <span className="font-semibold text-emerald-600">{worker.gpuUsage}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${worker.gpuUsage}%` }} />
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  {formatNumber(worker.processedCount)} jobs processed
                </span>
                <Button
                  onClick={() => toggleWorkerStatus(worker.id)}
                  variant="outline"
                  size="xs"
                >
                  {worker.status === 'offline' ? 'Re-attach' : 'Drain & Rotate'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Tab 2: Queue Monitoring */}
      {activeTab === 'queues' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {queues.map((q, idx) => (
            <Card key={idx} className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-amber-600 font-semibold">{q.type}</span>
                <Badge variant={q.status === 'healthy' ? 'success' : 'warning'} size="sm">
                  {q.status}
                </Badge>
              </div>

              <div>
                <h3 className="font-bold text-sm text-slate-900">{q.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">FIFO Distributed RabbitMQ cluster</p>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400 block">Active Running:</span>
                  <span className="text-lg font-bold text-slate-900">{q.activeCount}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Pending Queue:</span>
                  <span className="text-lg font-bold text-blue-600">{q.queuedCount}</span>
                </div>
                <div className="col-span-2 pt-1 border-t border-slate-200 flex justify-between">
                  <span className="text-slate-500">Average Turnaround:</span>
                  <span className="font-semibold text-slate-800">{q.avgLatencyMs} ms</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Tab 3: Failed Jobs */}
      {activeTab === 'failed' && (
        <Card>
          <CardHeader>
            <CardTitle>Failed OCR Jobs Requiring Operator Review</CardTitle>
            <CardDescription>Inspect stack trace errors, blurry images, or corrupted file streams</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Job ID</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">File Name</th>
                    <th className="py-3 px-4">Service</th>
                    <th className="py-3 px-4">Failure Reason</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {failedJobs.map((j) => (
                    <tr key={j.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-medium text-rose-600">{j.id}</td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800">{j.customerName}</td>
                      <td className="py-3.5 px-4 font-medium text-slate-800">{j.fileName}</td>
                      <td className="py-3.5 px-4 text-slate-600">{j.serviceName}</td>
                      <td className="py-3.5 px-4 text-rose-600 max-w-sm truncate" title={j.errorReason}>
                        {j.errorReason}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          onClick={() => retryJob(j.id)}
                          variant="danger"
                          size="xs"
                        >
                          <RotateCcw className="h-3 w-3 mr-1" /> Force Retry
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 4: All Jobs Stream */}
      {activeTab === 'allJobs' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Job ID</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">File Name</th>
                    <th className="py-3 px-4">Service</th>
                    <th className="py-3 px-4">Pages</th>
                    <th className="py-3 px-4">Duration</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jobs.slice(0, 15).map((job) => (
                    <tr key={job.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono text-blue-600">{job.id}</td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{job.customerName}</td>
                      <td className="py-3 px-4 text-slate-800">{job.fileName}</td>
                      <td className="py-3 px-4 text-slate-600">{job.serviceName}</td>
                      <td className="py-3 px-4 text-slate-700">{job.pageCount} pgs</td>
                      <td className="py-3 px-4 font-mono text-slate-500">{(job.processingDurationMs / 1000).toFixed(2)}s</td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={job.status === 'completed' ? 'success' : job.status === 'failed' ? 'danger' : 'info'}
                          size="sm"
                        >
                          {job.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
