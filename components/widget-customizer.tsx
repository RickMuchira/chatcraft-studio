import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Layout } from 'lucide-react';

const ANIMATION_OPTIONS = [
  { value: 'fade', label: 'Fade', description: 'Fade in and out' },
  { value: 'slide', label: 'Slide', description: 'Slide in and out' },
  { value: 'scale', label: 'Scale', description: 'Scale in and out' },
];

const POSITION_OPTIONS = [
  { value: 'top-left', label: 'Top Left', description: 'Position at the top left' },
  { value: 'top-center', label: 'Top Center', description: 'Position at the top center' },
  { value: 'top-right', label: 'Top Right', description: 'Position at the top right' },
  { value: 'center-left', label: 'Center Left', description: 'Position at the center left' },
  { value: 'center-center', label: 'Center Center', description: 'Position at the center center' },
  { value: 'center-right', label: 'Center Right', description: 'Position at the center right' },
  { value: 'bottom-left', label: 'Bottom Left', description: 'Position at the bottom left' },
  { value: 'bottom-center', label: 'Bottom Center', description: 'Position at the bottom center' },
  { value: 'bottom-right', label: 'Bottom Right', description: 'Position at the bottom right' },
];

const SIZE_OPTIONS = [
  { value: 'small', label: 'Small', dimensions: '200px x 100px' },
  { value: 'medium', label: 'Medium', dimensions: '300px x 150px' },
  { value: 'large', label: 'Large', dimensions: '400px x 200px' },
];

const WidgetCustomizer: React.FC = () => {
  const [styling, setStyling] = useState({
    animation: 'fade',
    position: 'center-center',
    size: 'medium',
  });

  const updateStyling = (newStyling: Partial<typeof styling>) => {
    setStyling((prev) => ({ ...prev, ...newStyling }));
  };

  return (
    <Tabs defaultValue="appearance" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="appearance">Appearance</TabsTrigger>
        <TabsTrigger value="layout">Layout</TabsTrigger>
        <TabsTrigger value="behavior">Behavior</TabsTrigger>
      </TabsList>

      {/* Appearance Tab */}
      <TabsContent value="appearance" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Layout className="h-5 w-5" />
              <span>Widget Appearance</span>
            </CardTitle>
            <CardDescription>
              Configure the appearance of your widget
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Animation Style</Label>
                <Select
                  value={styling.animation}
                  onValueChange={(value) => updateStyling({ animation: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ANIMATION_OPTIONS.map((animation) => (
                      <SelectItem key={animation.value} value={animation.value}>
                        <div>
                          <div className="font-medium">{animation.label}</div>
                          <div className="text-xs text-muted-foreground">{animation.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Layout Tab */}
      <TabsContent value="layout" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Layout className="h-5 w-5" />
              <span>Widget Layout</span>
            </CardTitle>
            <CardDescription>
              Configure the position and size of your widget
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Position</Label>
                <Select
                  value={styling.position}
                  onValueChange={(value: WidgetPosition) => updateStyling({ position: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POSITION_OPTIONS.map((position) => (
                      <SelectItem key={position.value} value={position.value}>
                        <div>
                          <div className="font-medium">{position.label}</div>
                          <div className="text-xs text-muted-foreground">{position.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Size</Label>
                <Select
                  value={styling.size}
                  onValueChange={(value: WidgetSize) => updateStyling({ size: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size.value} value={size.value}>
                        <div>
                          <div className="font-medium">{size.label}</div>
                          <div className="text-xs text-muted-foreground">{size.dimensions}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Behavior Tab */}
      <TabsContent value="behavior" className="space-y-6">
        {/* Behavior content */}
      </TabsContent>
    </Tabs>
  );
};

export default WidgetCustomizer; 