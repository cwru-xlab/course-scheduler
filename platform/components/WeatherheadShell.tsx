"use client";

import React, { useState } from "react";
import clsx from "clsx";
import {
  LayoutDashboard,
  FileEdit,
  Calendar as CalendarIcon,
  BarChart3,
  School,
  ChevronRight,
  Download,
  Plus,
  BookOpen,
  Users,
  DoorOpen,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Rocket,
  Filter,
  MoreVertical,
  Info,
  Clock,
  LayoutGrid,
  Gavel,
  Maximize2,
  Minimize2,
  Printer,
  Share2,
  Settings,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";

type Page = "dashboard" | "editor" | "calendar" | "reports" | "solver";

const WEEKLY_DATA = [
  { name: "Mon", value: 75 },
  { name: "Tue", value: 45 },
  { name: "Wed", value: 85 },
  { name: "Thu", value: 65 },
  { name: "Fri", value: 95 },
  { name: "Sat", value: 35 },
  { name: "Sun", value: 55 },
];

const SECTIONS = [
  {
    id: "MGMT-401-01",
    name: "Strategic Management",
    instructor: "Dr. Sarah Johnson",
    room: "Whead 204",
    time: "MW 09:00-10:15",
    capacity: "45/50",
    status: "SCHEDULED",
    dept: "Management",
  },
  {
    id: "ACCT-201-04",
    name: "Financial Accounting",
    instructor: "Prof. Michael Chen",
    room: "PBL 112",
    time: "TR 14:30-15:45",
    capacity: "60/60",
    status: "SCHEDULED",
    dept: "Accounting",
  },
  {
    id: "BAIS-300-02",
    name: "Data Analytics II",
    instructor: "Dr. Elena Rodriguez",
    room: "Lab B",
    time: "F 10:00-12:45",
    capacity: "28/30",
    status: "CONFLICT",
    dept: "BAIS",
  },
  {
    id: "ECON-102-01",
    name: "Macroeconomics",
    instructor: "Dr. Robert Smith",
    room: "—",
    time: "TBD",
    capacity: "0/120",
    status: "UNASSIGNED",
    dept: "Economics",
  },
  {
    id: "MKGT-301-01",
    name: "Marketing Principles",
    instructor: "Prof. Lisa Wong",
    room: "PBL 201",
    time: "MW 11:30-12:45",
    capacity: "42/45",
    status: "SCHEDULED",
    dept: "Marketing",
  },
];

const INSTRUCTORS = [
  {
    initials: "AT",
    name: "Dr. Aris Thompson",
    rank: "PROFESSOR",
    days: ["MON", "WED"],
    maxDays: 3,
    unavailable: "Tue 10:00-12:00, Fri All Day",
    status: "Active",
  },
  {
    initials: "SJ",
    name: "Sarah Jenkins",
    rank: "ADJUNCT",
    days: ["TUE", "THU"],
    maxDays: 2,
    unavailable: "Friday All Day",
    status: "Active",
  },
  {
    initials: "MC",
    name: "Michael Chen",
    rank: "ASSOC. PROF",
    days: ["MON", "TUE", "WED"],
    maxDays: 4,
    unavailable: "None specified",
    status: "Active",
  },
  {
    initials: "ER",
    name: "Elena Rodriguez",
    rank: "PROFESSOR",
    days: ["WED", "FRI"],
    maxDays: 3,
    unavailable: "Mon 08:00-10:00",
    status: "On Leave",
  },
  {
    initials: "DS",
    name: "David Smith",
    rank: "ASST. PROF",
    days: ["TUE", "THU"],
    maxDays: 3,
    unavailable: "Thu 14:00-16:00",
    status: "Active",
  },
];

const ROOMS = [
  {
    id: "PBL-112",
    name: "Peter B. Lewis 112",
    type: "Lecture Hall",
    capacity: 60,
    features: ["Projector", "Audio"],
    status: "Available",
  },
  {
    id: "WHEAD-204",
    name: "Weatherhead 204",
    type: "Seminar Room",
    capacity: 25,
    features: ["Whiteboard"],
    status: "In Use",
  },
  {
    id: "LAB-B",
    name: "Computer Lab B",
    type: "Lab",
    capacity: 30,
    features: ["Workstations"],
    status: "Available",
  },
  {
    id: "BALL-A",
    name: "Ballroom A",
    type: "Large Hall",
    capacity: 200,
    features: ["Stage", "PA System"],
    status: "Maintenance",
  },
];

const CONSTRAINTS = [
  {
    id: "C-01",
    name: "Instructor Back-to-Back",
    type: "Hard",
    weight: "N/A",
    description:
      "Instructors cannot have sessions in different buildings with < 15m gap.",
  },
  {
    id: "C-02",
    name: "Room Capacity",
    type: "Hard",
    weight: "N/A",
    description: "Section enrollment cannot exceed room capacity.",
  },
  {
    id: "C-03",
    name: "Preferred Timeslots",
    type: "Soft",
    weight: 50,
    description: "Prioritize morning slots for core undergraduate courses.",
  },
  {
    id: "C-04",
    name: "Travel Distance",
    type: "Soft",
    weight: 20,
    description:
      "Minimize travel distance between consecutive sessions for students.",
  },
];

const Dashboard = ({ setPage }: { setPage: (p: Page) => void }) => (
  <div className="space-y-8 animate-in fade-in duration-500">
    <nav className="flex items-center gap-2 text-sm">
      <button className="text-slate-500 hover:text-weatherhead-primary flex items-center gap-1">
        <LayoutDashboard className="size-4" />
        Home
      </button>
      <ChevronRight className="size-4 text-slate-400" />
      <span className="text-slate-900 font-medium">Dashboard</span>
    </nav>

    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div>
        <h2 className="text-3xl font-black tracking-tight text-slate-900">
          Academic Dashboard
        </h2>
        <p className="mt-2 text-slate-600 max-w-lg leading-relaxed">
          Overview of current scheduling operations for the Weatherhead School
          of Management, Fall 2024 Semester.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors">
          <Download className="size-4" />
          Export PDF
        </button>
        <button
          onClick={() => setPage("solver")}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold bg-[#137fec] text-white rounded-lg hover:opacity-90 shadow-lg shadow-[#137fec]/20 transition-all"
        >
          <Plus className="size-4" />
          New Course
        </button>
      </div>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">
              Total Courses
            </p>
            <p className="text-3xl font-bold text-slate-900 mt-2">124</p>
          </div>
          <div className="p-2 bg-[#137fec]/10 rounded-lg">
            <BookOpen className="size-6 text-[#137fec]" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-1 text-emerald-600 text-sm font-semibold">
          <TrendingUp className="size-4" />
          <span>+12% vs last semester</span>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">
              Pending Approvals
            </p>
            <p className="text-3xl font-bold text-slate-900 mt-2">8</p>
          </div>
          <div className="p-2 bg-orange-100 rounded-lg">
            <Clock className="size-6 text-orange-600" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-1 text-orange-600 text-sm font-semibold">
          <AlertTriangle className="size-4" />
          <span>Requires immediate action</span>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">
              Room Utilization
            </p>
            <p className="text-3xl font-bold text-slate-900 mt-2">85%</p>
          </div>
          <div className="p-2 bg-blue-100 rounded-lg">
            <DoorOpen className="size-6 text-blue-600" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-1 text-emerald-600 text-sm font-semibold">
          <CheckCircle2 className="size-4" />
          <span>Optimal range achieved</span>
        </div>
      </div>
    </div>

    <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-slate-900">Weekly Overview</h3>
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button className="px-3 py-1 text-xs font-bold rounded-md bg-white shadow-sm">
            Chart
          </button>
          <button className="px-3 py-1 text-xs font-bold text-slate-500">
            List
          </button>
        </div>
      </div>
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={WEEKLY_DATA}>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="#f1f5f9"
            />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#64748b", fontSize: 12 }}
              dy={10}
            />
            <YAxis hide />
            <RechartsTooltip
              cursor={{ fill: "#f8fafc" }}
              contentStyle={{
                borderRadius: "8px",
                border: "none",
                boxShadow:
                  "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              }}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {WEEKLY_DATA.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={index === 4 ? "#137fec" : "#93c5fd"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 flex items-center justify-center gap-2 text-slate-400">
        <BarChart3 className="size-4" />
        <span className="text-sm font-medium">
          Data visualization active for Fall 2024
        </span>
      </div>
    </section>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {[
        {
          label: "Edit Sections",
          icon: LayoutGrid,
          page: "editor",
          color: "text-blue-600",
          bg: "bg-blue-50",
        },
        {
          label: "Manage Faculty",
          icon: Users,
          page: "editor",
          color: "text-emerald-600",
          bg: "bg-emerald-50",
        },
        {
          label: "View Calendar",
          icon: CalendarIcon,
          page: "calendar",
          color: "text-indigo-600",
          bg: "bg-indigo-50",
        },
        {
          label: "System Reports",
          icon: BarChart3,
          page: "reports",
          color: "text-rose-600",
          bg: "bg-rose-50",
        },
      ].map((action, i) => (
        <button
          key={i}
          onClick={() => setPage(action.page as Page)}
          className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:border-[#137fec] hover:shadow-md transition-all group text-left"
        >
          <div
            className={clsx(
              "size-10 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform",
              action.bg,
              action.color,
            )}
          >
            <action.icon className="size-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">
              {action.label}
            </p>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
              Quick Access
            </p>
          </div>
        </button>
      ))}
    </div>
  </div>
);

const DataEditor = () => {
  // Default to the Sections tab
  const [activeTab, setActiveTab] = useState("sections");

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Data Editor
          </h1>
          <p className="text-slate-500 mt-1">
            Manage school-wide scheduling entities, preferences, and
            constraints.
          </p>
        </div>
        <button className="flex items-center justify-center rounded-lg h-10 px-4 bg-[#137fec] text-white text-sm font-bold shadow-sm hover:bg-[#137fec]/90 transition-all gap-2">
          <Plus className="size-4" />
          Add New {activeTab.slice(0, -1)}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 px-6 overflow-x-auto">
          <div className="flex gap-8">
            {[
              { id: "sections", label: "Sections", icon: LayoutGrid },
              { id: "instructors", label: "Instructors", icon: Users },
              { id: "rooms", label: "Rooms", icon: DoorOpen },
              { id: "constraints", label: "Constraints", icon: Gavel },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  "flex items-center border-b-2 py-4 px-1 text-sm font-semibold transition-colors gap-2 whitespace-nowrap",
                  activeTab === tab.id
                    ? "border-[#137fec] text-[#137fec]"
                    : "border-transparent text-slate-500 hover:text-[#137fec]",
                )}
              >
                <tab.icon className="size-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 bg-slate-50/50 border-b border-slate-200 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Active Filters:
            </span>
            <div className="flex gap-2">
              <span className="bg-[#137fec]/10 text-[#137fec] text-[11px] font-bold px-2 py-1 rounded border border-[#137fec]/20 flex items-center gap-1">
                Status: All{" "}
                <Plus className="size-3 rotate-45 cursor-pointer" />
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="text-xs font-semibold text-slate-600 flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-white transition-colors">
              <Filter className="size-3" /> Filter
            </button>
            <button className="text-xs font-semibold text-slate-600 flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-white transition-colors">
              <Download className="size-3" /> Export
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            {activeTab === "instructors" && (
              <>
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                    <th className="px-6 py-4">Instructor Name</th>
                    <th className="px-6 py-4">Rank</th>
                    <th className="px-6 py-4">Preferred Days</th>
                    <th className="px-6 py-4 text-center">Max Days</th>
                    <th className="px-6 py-4">Unavailable Times</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {INSTRUCTORS.map((instructor, i) => (
                    <tr
                      key={i}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 text-xs font-bold border border-slate-200">
                            {instructor.initials}
                          </div>
                          <span className="font-semibold text-sm text-slate-900">
                            {instructor.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={clsx(
                            "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold",
                            instructor.rank === "PROFESSOR"
                              ? "bg-blue-100 text-blue-700"
                              : instructor.rank === "ADJUNCT"
                                ? "bg-emerald-100 text-emerald-700"
                                : instructor.rank === "ASSOC. PROF"
                                  ? "bg-indigo-100 text-indigo-700"
                                  : "bg-amber-100 text-amber-700",
                          )}
                        >
                          {instructor.rank}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          {instructor.days.map((day) => (
                            <span
                              key={day}
                              className="text-[9px] font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 border border-slate-200"
                            >
                              {day}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-sm font-medium text-slate-700">
                          {instructor.maxDays}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-slate-500">
                          {instructor.unavailable}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          <button className="p-1.5 text-slate-400 hover:text-[#137fec] hover:bg-[#137fec]/10 rounded transition-colors">
                            <FileEdit className="size-4" />
                          </button>
                          <button className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                            <MoreVertical className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}

            {activeTab === "sections" && (
              <>
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                    <th className="px-6 py-4">Section ID</th>
                    <th className="px-6 py-4">Course Name</th>
                    <th className="px-6 py-4">Instructor</th>
                    <th className="px-6 py-4">Time Slot</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {SECTIONS.map((section, i) => (
                    <tr
                      key={i}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      <td className="px-6 py-4 font-bold text-xs text-[#137fec]">
                        {section.id}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-slate-900">
                        {section.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {section.instructor}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {section.time}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={clsx(
                            "px-2 py-1 rounded-full text-[10px] font-bold",
                            section.status === "SCHEDULED"
                              ? "bg-emerald-100 text-emerald-700"
                              : section.status === "CONFLICT"
                                ? "bg-red-100 text-red-700"
                                : "bg-slate-100 text-slate-600",
                          )}
                        >
                          {section.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="p-1.5 text-slate-400 hover:text-[#137fec] rounded transition-colors">
                          <FileEdit className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}

            {activeTab === "rooms" && (
              <>
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                    <th className="px-6 py-4">Room Name</th>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4 text-center">Capacity</th>
                    <th className="px-6 py-4">Features</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ROOMS.map((room, i) => (
                    <tr
                      key={i}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      <td className="px-6 py-4 font-semibold text-sm text-slate-900">
                        {room.name}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {room.type}
                      </td>
                      <td className="px-6 py-4 text-center text-sm font-bold">
                        {room.capacity}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          {room.features.map((f) => (
                            <span
                              key={f}
                              className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={clsx(
                            "px-2 py-0.5 rounded text-[10px] font-bold",
                            room.status === "Available"
                              ? "bg-emerald-100 text-emerald-700"
                              : room.status === "In Use"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-amber-100 text-amber-700",
                          )}
                        >
                          {room.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="p-1.5 text-slate-400 hover:text-[#137fec] rounded transition-colors">
                          <Settings className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}

            {activeTab === "constraints" && (
              <>
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                    <th className="px-6 py-4">Constraint</th>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4 text-center">Weight</th>
                    <th className="px-6 py-4">Description</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {CONSTRAINTS.map((c, i) => (
                    <tr
                      key={i}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      <td className="px-6 py-4 font-bold text-sm text-slate-900">
                        {c.name}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={clsx(
                            "px-2 py-0.5 rounded text-[10px] font-bold",
                            c.type === "Hard"
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700",
                          )}
                        >
                          {c.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-sm font-medium text-slate-600">
                        {c.weight}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500 max-w-xs">
                        {c.description}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button className="p-1.5 text-slate-400 hover:text-[#137fec] rounded transition-colors">
                          <Settings className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
          </table>
        </div>
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="text-xs text-slate-500 font-medium">
            Showing{" "}
            <span className="text-slate-900 font-bold">
              1 -{" "}
              {activeTab === "instructors"
                ? INSTRUCTORS.length
                : activeTab === "sections"
                  ? SECTIONS.length
                  : activeTab === "rooms"
                    ? ROOMS.length
                    : CONSTRAINTS.length}
            </span>{" "}
            entries
          </div>
          <div className="flex items-center gap-2">
            <button
              className="size-8 flex items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:text-[#137fec] disabled:opacity-50"
              disabled
            >
              <ChevronRight className="size-4 rotate-180" />
            </button>
            <button className="size-8 flex items-center justify-center rounded border border-[#137fec] bg-[#137fec] text-white text-xs font-bold">
              1
            </button>
            <button className="size-8 flex items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:text-[#137fec]">
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};

const SolverResults = () => {
  const [isSolving, setIsSolving] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleRunSolver = () => {
    setIsSolving(true);
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => setIsSolving(false), 500);
          return 100;
        }
        return prev + 5;
      });
    }, 100);
  };

  if (isSolving) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-8 animate-in fade-in duration-300">
        <div className="relative size-32">
          <svg className="size-full -rotate-90" viewBox="0 0 100 100">
            <circle
              className="text-slate-200 stroke-current"
              strokeWidth="8"
              cx="50"
              cy="50"
              r="40"
              fill="transparent"
            />
            <circle
              className="text-[#137fec] stroke-current transition-all duration-300 ease-out"
              strokeWidth="8"
              strokeDasharray="251.2"
              strokeDashoffset={251.2 - (251.2 * progress) / 100}
              strokeLinecap="round"
              cx="50"
              cy="50"
              r="40"
              fill="transparent"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-black text-slate-900">
              {progress}%
            </span>
          </div>
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-900">
            Optimizing Schedule...
          </h2>
          <p className="text-slate-500 mt-2">
            Running genetic algorithm on 248 sections and 42 rooms.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="size-2 bg-[#137fec] rounded-full animate-bounce [animation-delay:-0.3s]" />
          <div className="size-2 bg-[#137fec] rounded-full animate-bounce [animation-delay:-0.15s]" />
          <div className="size-2 bg-[#137fec] rounded-full animate-bounce" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in zoom-in-95 duration-500">
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Validation &amp; Solver Results
          </h1>
          <p className="text-slate-500 text-base">
            Review scheduling health, soft constraints, and final section
            assignments.
          </p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center justify-center rounded-lg h-11 px-6 bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200 transition-colors">
            <Download className="size-4 mr-2" />
            Export CSV
          </button>
          <button
            onClick={handleRunSolver}
            className="flex items-center justify-center rounded-lg h-11 px-6 bg-[#137fec] text-white text-sm font-bold hover:bg-[#137fec]/90 shadow-lg shadow-[#137fec]/20 transition-all"
          >
            <Rocket className="size-4 mr-2" />
            Run Solver
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">
                Solver Score
              </h3>
              <span className="px-3 py-1 bg-green-100 text-green-600 text-xs font-bold rounded-full">
                OPTIMAL
              </span>
            </div>
            <div className="flex flex-col items-center py-6">
              <div className="text-5xl font-black text-[#137fec] mb-2">
                942
              </div>
              <p className="text-slate-400 text-sm font-medium">
                Out of 1000 potential score
              </p>
            </div>
            <div className="space-y-4 mt-4">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Hard Constraints</span>
                  <span className="text-green-500 font-bold">100% met</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 1 }}
                    className="bg-green-500 h-full rounded-full"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Soft Constraints</span>
                  <span className="text-amber-500 font-bold">88% met</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: "88%" }}
                    transition={{ duration: 1, delay: 0.2 }}
                    className="bg-amber-500 h-full rounded-full"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-4">
              Penalty Breakdown
            </h3>
            <div className="space-y-4">
              {[
                {
                  label: "Instructor Gaps",
                  sub: "4 instances of >2hr gaps",
                  score: "-24 pts",
                  color: "bg-red-100 text-red-600",
                  icon: AlertTriangle,
                },
                {
                  label: "Room Utilization",
                  sub: "Low capacity in large halls",
                  score: "-18 pts",
                  color: "bg-amber-100 text-amber-600",
                  icon: DoorOpen,
                },
                {
                  label: "Travel Distance",
                  sub: "Back-to-back across campus",
                  score: "-16 pts",
                  color: "bg-blue-100 text-blue-600",
                  icon: TrendingUp,
                },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div
                    className={clsx(
                      "size-8 rounded flex items-center justify-center",
                      item.color,
                    )}
                  >
                    <item.icon className="size-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">
                      {item.label}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium">
                      {item.sub}
                    </p>
                  </div>
                  <div className="text-sm font-bold text-slate-700">
                    {item.score}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border-l-4 border-l-red-500 border-y border-r border-slate-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-lg bg-red-50 flex items-center justify-center text-red-600">
                  <AlertTriangle className="size-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Validation Errors
                  </h3>
                  <p className="text-sm text-slate-500">
                    3 high-priority conflicts remaining
                  </p>
                </div>
              </div>
              <button className="text-xs font-bold text-[#137fec] hover:underline px-4 py-2 bg-[#137fec]/10 rounded-lg transition-colors">
                Fix All Automagically
              </button>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Suggested Fix</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    {
                      code: "ERR_01",
                      desc: "Instructor overlap: Prof. Elena Smith",
                      fix: "Reschedule BAFI 402 to T/TH",
                    },
                    {
                      code: "ERR_05",
                      desc: "Room capacity exceeded: PBL 201",
                      fix: "Move to Ballroom 303",
                    },
                    {
                      code: "ERR_09",
                      desc: "Lab equipment conflict: Lab 10",
                      fix: "Assign to Lab 12 instead",
                    },
                  ].map((err, i) => (
                    <tr
                      key={i}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-4 py-4 text-xs font-mono text-red-600 font-bold">
                        {err.code}
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-700 font-medium">
                        {err.desc}
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-500 italic">
                        {err.fix}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button className="text-[#137fec] hover:text-[#137fec]/80 font-bold text-xs">
                          Modify
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-lg bg-[#137fec]/10 flex items-center justify-center text-[#137fec]">
                  <BarChart3 className="size-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  Final Assignments
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-400">
                  View:
                </span>
                <select className="bg-slate-50 border-none text-[11px] font-bold rounded-lg px-2 h-8 focus:ring-0 cursor-pointer">
                  <option>All Sections</option>
                  <option>By Department</option>
                  <option>By Instructor</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Section</th>
                    <th className="px-6 py-4">Instructor</th>
                    <th className="px-6 py-4">Days/Time</th>
                    <th className="px-6 py-4">Room</th>
                    <th className="px-6 py-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[
                    {
                      id: "ACCT 201 - 10",
                      sub: "Financial Accounting",
                      prof: "R. Thompson",
                      time: "MWF 09:00 - 10:15",
                      room: "PBL 304",
                      status: "success",
                    },
                    {
                      id: "BAFI 402 - 01",
                      sub: "Corporate Finance",
                      prof: "E. Smith",
                      time: "MWF 09:00 - 10:15",
                      room: "PBL 201",
                      status: "error",
                    },
                    {
                      id: "MGMT 310 - 04",
                      sub: "Org Behavior",
                      prof: "L. Chen",
                      time: "T/TH 13:00 - 14:15",
                      room: "George Hall 102",
                      status: "success",
                    },
                    {
                      id: "MKTG 401 - 02",
                      sub: "Strategy",
                      prof: "P. Jackson",
                      time: "MW 16:00 - 17:30",
                      room: "Ballroom A",
                      status: "success",
                    },
                    {
                      id: "OPRE 201 - 08",
                      sub: "Stats",
                      prof: "J. Doe",
                      time: "T/TH 08:30 - 09:45",
                      room: "PBL 201",
                      status: "warning",
                    },
                  ].map((row, i) => (
                    <tr
                      key={i}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-slate-900">
                          {row.id}
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium">
                          {row.sub}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {row.prof}
                      </td>
                      <td
                        className={clsx(
                          "px-6 py-4 text-sm",
                          row.status === "error"
                            ? "text-red-500 font-bold"
                            : "text-slate-700",
                        )}
                      >
                        {row.time}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-900">
                        {row.room}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {row.status === "success" && (
                          <CheckCircle2 className="size-5 text-emerald-500 mx-auto" />
                        )}
                        {row.status === "error" && (
                          <AlertTriangle className="size-5 text-red-500 mx-auto" />
                        )}
                        {row.status === "warning" && (
                          <Info className="size-5 text-amber-500 mx-auto" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
              <button className="text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors">
                Show all 248 assignments
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Calendar = () => (
  <div className="space-y-8 animate-in fade-in zoom-in-95 duration-500">
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div className="flex flex-col">
        <h1 className="text-3xl font-black tracking-tight text-slate-900">
          Schedule Output Calendar
        </h1>
        <p className="text-slate-500 text-base">
          Academic Year 2024-2025 • Spring Semester • Final Draft
        </p>
      </div>
      <div className="flex gap-3">
        <button className="flex items-center justify-center rounded-lg h-10 px-4 bg-slate-100 text-slate-900 font-bold gap-2 border border-slate-200">
          <Share2 className="size-4" />
          Export PDF
        </button>
        <button className="flex items-center justify-center rounded-lg h-10 px-4 bg-[#137fec] text-white font-bold gap-2 shadow-lg shadow-[#137fec]/20">
          <Rocket className="size-4" />
          Adjust Schedule Data
        </button>
      </div>
    </div>

    <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <span className="text-[10px] font-bold text-slate-400 uppercase px-2 tracking-widest">
          Departments:
        </span>
        {[
          {
            label: "Accounting",
            color: "bg-[#137fec]",
            bg: "bg-[#137fec]/10",
            border: "border-[#137fec]/20",
            text: "text-[#137fec]",
          },
          {
            label: "Economics",
            color: "bg-emerald-500",
            bg: "bg-emerald-500/10",
            border: "border-emerald-500/20",
            text: "text-emerald-600",
          },
          {
            label: "Design & Innovation",
            color: "bg-amber-500",
            bg: "bg-amber-500/10",
            border: "border-amber-500/20",
            text: "text-amber-600",
          },
          {
            label: "Operations",
            color: "bg-indigo-500",
            bg: "bg-indigo-500/10",
            border: "border-indigo-500/20",
            text: "text-indigo-600",
          },
          {
            label: "Marketing",
            color: "bg-rose-500",
            bg: "bg-rose-500/10",
            border: "border-rose-500/20",
            text: "text-rose-600",
          },
        ].map((dept) => (
          <div
            key={dept.label}
            className={clsx(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold whitespace-nowrap",
              dept.bg,
              dept.border,
              dept.text,
            )}
          >
            <div className={clsx("w-2 h-2 rounded-full", dept.color)} />
            {dept.label}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 ml-4 pl-4 border-l border-slate-200">
        <button className="p-2 text-slate-500 hover:text-[#137fec] transition-colors">
          <Maximize2 className="size-4" />
        </button>
        <button className="p-2 text-slate-500 hover:text-[#137fec] transition-colors">
          <Minimize2 className="size-4" />
        </button>
        <button className="p-2 text-slate-500 hover:text-[#137fec] transition-colors">
          <Filter className="size-4" />
        </button>
        <button className="p-2 text-slate-500 hover:text-[#137fec] transition-colors">
          <Printer className="size-4" />
        </button>
      </div>
    </div>

    <div className="bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden flex flex-col min-h-[600px]">
      <div className="flex bg-slate-50 border-b border-slate-200">
        <div className="w-40 flex-shrink-0 border-r border-slate-200 p-4 font-bold text-[10px] uppercase text-slate-500 tracking-widest">
          Rooms \ Time
        </div>
        <div className="flex flex-1">
          {[
            "8AM",
            "9AM",
            "10AM",
            "11AM",
            "12PM",
            "1PM",
            "2PM",
            "3PM",
            "4PM",
            "5PM",
            "6PM",
            "7PM",
            "8PM",
            "9PM",
          ].map((time) => (
            <div
              key={time}
              className="flex-1 text-center p-4 border-r border-slate-200 text-[10px] font-bold text-slate-500"
            >
              {time}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto relative">
        {[
          {
            name: "PBL 102",
            cap: "45 | Tier 1",
            events: [
              {
                title: "ACCT 401",
                sec: "01A",
                prof: "Prof. Smith",
                time: "09:00 - 11:00",
                left: "7.14%",
                width: "14.28%",
                color: "bg-[#137fec]",
              },
              {
                title: "MRKT 210",
                sec: "12",
                prof: "Prof. Lee",
                time: "13:00 - 14:30",
                left: "35.71%",
                width: "10.71%",
                color: "bg-rose-500",
              },
            ],
          },
          {
            name: "PBL 208",
            cap: "60 | Tier 1",
            events: [
              {
                title: "ECON 101",
                sec: "04",
                prof: "Prof. Brown",
                time: "08:00 - 10:00",
                left: "0%",
                width: "14.28%",
                color: "bg-emerald-500",
              },
              {
                title: "OPER 305",
                sec: "02",
                prof: "Prof. Miller",
                time: "11:00 - 13:00",
                left: "21.42%",
                width: "14.28%",
                color: "bg-indigo-500",
              },
            ],
          },
          {
            name: "George S. Dively",
            cap: "120 | Tier 2",
            events: [
              {
                title: "DESN 501: Innovation Strategy",
                sec: "A",
                prof: "Prof. Garcia",
                time: "15:00 - 18:00",
                left: "50%",
                width: "21.42%",
                color: "bg-amber-500",
              },
            ],
          },
          {
            name: "PBL 315",
            cap: "30 | Tier 3",
            events: [
              {
                title: "MRKT 415",
                sec: "01",
                prof: "Prof. Wilson",
                time: "09:00 - 10:30",
                left: "7.14%",
                width: "10.71%",
                color: "bg-rose-500",
              },
              {
                title: "ACCT 600",
                sec: "GR",
                prof: "Prof. Davis",
                time: "19:00 - 21:00",
                left: "78.57%",
                width: "14.28%",
                color: "bg-[#137fec]",
              },
            ],
          },
        ].map((room, i) => (
          <div key={i} className="flex border-b border-slate-100 min-h-[120px]">
            <div className="w-40 flex-shrink-0 border-r border-slate-200 bg-slate-50/30 p-4 flex flex-col justify-center">
              <span className="font-bold text-sm text-slate-900">
                {room.name}
              </span>
              <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold mt-1">
                Cap: {room.cap}
              </span>
            </div>
            <div className="flex-1 relative">
              <div className="absolute inset-0 grid grid-cols-14 pointer-events-none">
                {Array.from({ length: 14 }).map((_, j) => (
                  <div
                    key={j}
                    className="border-r border-slate-100 last:border-r-0"
                  />
                ))}
              </div>
              {room.events.map((event, k) => (
                <div
                  key={k}
                  className={clsx(
                    "absolute top-3 bottom-3 border-l-4 rounded-lg p-2.5 flex flex-col justify-between group cursor-pointer transition-all z-10 shadow-sm hover:shadow-md",
                    event.color.replace("bg-", "bg-") + "/20",
                    event.color.replace("bg-", "border-"),
                  )}
                  style={{ left: event.left, width: event.width }}
                >
                  <div>
                    <div className="font-black text-[10px] truncate text-slate-900">
                      {event.title}
                    </div>
                    <div className="text-[9px] font-bold text-slate-500">
                      Sec: {event.sec}
                    </div>
                  </div>
                  <div className="text-[9px] font-bold leading-tight text-slate-700">
                    {event.prof}
                    <br />
                    {event.time}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="size-5 text-[#137fec]" />
          <h3 className="font-bold text-sm text-slate-900">
            Room Utilization
          </h3>
        </div>
        <div className="space-y-4">
          {[
            { label: "PBL 102", value: 82 },
            { label: "Dively Hall", value: 45 },
          ].map((item, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs font-bold text-slate-600">
                <span>{item.label}</span>
                <span>{item.value}%</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${item.value}%` }}
                  className="bg-[#137fec] h-full rounded-full"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-rose-50 p-6 rounded-xl border border-rose-100 shadow-sm col-span-1 md:col-span-2">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="size-5 text-rose-500" />
          <h3 className="font-bold text-sm text-rose-900">
            Conflict Detection (3)
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex items-start gap-3 bg-white/60 p-3 rounded-lg border border-rose-200">
            <AlertTriangle className="size-4 text-rose-500 mt-0.5" />
            <div className="text-[11px] leading-relaxed text-slate-700">
              <span className="font-bold text-slate-900">
                Prof. Miller
              </span>{" "}
              has overlapping sessions in{" "}
              <span className="font-bold text-slate-900">
                PBL 208
              </span>{" "}
              and{" "}
              <span className="font-bold text-slate-900">
                PBL 401
              </span>{" "}
              at 11:30 AM.
            </div>
          </div>
          <div className="flex items-start gap-3 bg-white/60 p-3 rounded-lg border border-rose-200">
            <Users className="size-4 text-rose-500 mt-0.5" />
            <div className="text-[11px] leading-relaxed text-slate-700">
              <span className="font-bold text-slate-900">
                ACCT 600
              </span>{" "}
              enrollment (32) exceeds room{" "}
              <span className="font-bold text-slate-900">
                PBL 315
              </span>{" "}
              capacity (30).
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export const WeatherheadShell = () => {
  // Make the editor (Sections tab) the landing experience
  const [page, setPage] = useState<Page>("editor");

  const handleRunSolver = () => {
    setPage("solver");
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] font-sans selection:bg-[#137fec]/30">
      <div className="max-w-7xl mx-auto px-0 py-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {page === "dashboard" && <Dashboard setPage={setPage} />}
            {page === "editor" && <DataEditor />}
            {page === "calendar" && <Calendar />}
            {page === "solver" && <SolverResults />}
            {page === "reports" && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <BarChart3 className="size-16 mb-4 opacity-20" />
                <h2 className="text-xl font-bold">Reports Module</h2>
                <p>Advanced analytics coming soon for Spring 2025.</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {(page === "dashboard" || page === "editor") && (
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-xl px-4 z-50"
        >
          <div className="bg-white p-4 rounded-2xl shadow-2xl border border-[#137fec]/20 flex items-center justify-between gap-6 ring-4 ring-[#137fec]/10">
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#137fec]">
                Optimizer Ready
              </span>
              <span className="text-slate-500 text-[11px] font-medium">
                Full constraints check passed
              </span>
            </div>
            <button
              onClick={handleRunSolver}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl h-14 bg-[#137fec] text-white text-lg font-black hover:bg-[#137fec]/90 transition-all active:scale-95 shadow-lg shadow-[#137fec]/30"
            >
              <Rocket className="size-6" />
              RUN SOLVER
            </button>
            <button className="h-14 w-14 flex items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">
              <Settings className="size-6" />
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

