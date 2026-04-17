import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/api/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PaymentScheduleMaster = () => {
  const queryClient = useQueryClient();
  const [selectedProject, setSelectedProject] = useState("");
  const [localSchedules, setLocalSchedules] = useState([]);

  // Fetch Projects for dropdown
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiClient.get("/projects"),
  });

  // Fetch Schedules
  const { data: allSchedules = [], isLoading } = useQuery({
    queryKey: ["schedule-master"],
    queryFn: () => apiClient.get("/pricing/schedule-master"),
    onSuccess: (data) => {
      if (selectedProject) {
        setLocalSchedules(data.filter(s => s.project_id === selectedProject));
      }
    }
  });

  // Keep local state synced when selection changes
  React.useEffect(() => {
    if (selectedProject) {
      setLocalSchedules(allSchedules.filter(s => s.project_id === selectedProject).map(s => ({...s})));
    } else {
      setLocalSchedules([]);
    }
  }, [selectedProject, allSchedules]);

  const saveMutation = useMutation({
    mutationFn: (schedules) => apiClient.post("/pricing/schedule-master", { schedules }),
    onSuccess: () => {
      toast.success("Schedule saved successfully");
      queryClient.invalidateQueries({ queryKey: ["schedule-master"] });
    },
    onError: (err) => toast.error(err.response?.data?.error || "Failed to save schedule")
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => apiClient.delete(`/pricing/schedule-master/${id}`),
    onSuccess: () => {
      toast.success("Milestone deleted");
      queryClient.invalidateQueries({ queryKey: ["schedule-master"] });
    },
  });

  const handleAddRow = () => {
    if (!selectedProject) {
      toast.error("Select a project first");
      return;
    }
    setLocalSchedules([
      ...localSchedules,
      {
        id: null,
        project_id: selectedProject,
        milestone_name: "",
        percentage_of_total: 0,
        display_order: localSchedules.length + 1
      }
    ]);
  };

  const handleUpdateRow = (index, field, value) => {
    const updated = [...localSchedules];
    updated[index][field] = value;
    setLocalSchedules(updated);
  };

  const handleRemoveRow = (index, id) => {
    if (id) {
      deleteMutation.mutate(id);
    } else {
      const updated = localSchedules.filter((_, i) => i !== index);
      setLocalSchedules(updated);
    }
  };

  const handleSave = () => {
    const totalPercent = localSchedules.reduce((acc, curr) => acc + parseFloat(curr.percentage_of_total || 0), 0);
    if (Math.abs(totalPercent - 100) > 0.01) {
      toast.error(`Total percentage must equal exactly 100%. Current: ${totalPercent}%`);
      return;
    }

    const payload = localSchedules.map((row, idx) => ({
      ...row,
      display_order: idx + 1
    }));
    
    saveMutation.mutate(payload);
  };

  if (isLoading && projects.length === 0) {
     return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payment Schedule Master</h1>
          <p className="text-muted-foreground">Define default milestones and percentage splits for projects</p>
        </div>
        <Button onClick={handleSave} disabled={saveMutation.isPending || !selectedProject}>
          <Save className="mr-2 h-4 w-4" /> Save Schedule
        </Button>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Select Project</CardTitle>
          <CardDescription>Choose a project to configure its payment schedule</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-[300px]">
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger>
                <SelectValue placeholder="Select Project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.project_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {selectedProject && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Milestones</CardTitle>
              <CardDescription>Total must equal 100%</CardDescription>
            </div>
            <Button variant="outline" onClick={handleAddRow}>
              <Plus className="mr-2 h-4 w-4" /> Add Milestone
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Order</TableHead>
                  <TableHead>Milestone Name</TableHead>
                  <TableHead className="w-32 text-right">Percentage (%)</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {localSchedules.map((row, i) => (
                  <TableRow key={row.id || i}>
                    <TableCell>{row.display_order}</TableCell>
                    <TableCell>
                      <Input
                        value={row.milestone_name}
                        onChange={(e) => handleUpdateRow(i, "milestone_name", e.target.value)}
                        placeholder="e.g. Booking Amount"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="text-right"
                        value={row.percentage_of_total}
                        onChange={(e) => handleUpdateRow(i, "percentage_of_total", parseFloat(e.target.value) || 0)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => handleRemoveRow(i, row.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {localSchedules.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                      No milestones defined. Add one to start.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            
            <div className="mt-4 flex justify-between items-center text-sm">
              <span className="text-muted-foreground font-medium">Total:</span>
              <span className={`font-bold ${
                Math.abs(localSchedules.reduce((a, b) => a + parseFloat(b.percentage_of_total || 0), 0) - 100) > 0.01 
                ? "text-destructive" 
                : "text-green-600"
              }`}>
                {localSchedules.reduce((a, b) => a + parseFloat(b.percentage_of_total || 0), 0).toFixed(2)}%
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PaymentScheduleMaster;
