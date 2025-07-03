'use client';

import { useState } from 'react';
import {
    Box,
    VStack,
    HStack,
    Button,
    ButtonGroup,
    Menu,
    MenuButton,
    MenuList,
    MenuItem,
    Divider,
    Text,
    useToast,
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalFooter,
    ModalBody,
    ModalCloseButton,
    FormControl,
    FormLabel,
    Input,
    Select,
    NumberInput,
    NumberInputField,
    useDisclosure,
} from '@chakra-ui/react';
import { Plus, Trash2, Link2, Unlink } from 'lucide-react';
import api from '@/utils/api';

export default function NetworkEditor({ cy, onElementAdded, onElementDeleted }) {
    const toast = useToast();
    const { isOpen, onOpen, onClose } = useDisclosure();
    const [editMode, setEditMode] = useState('select');
    const [newElementType, setNewElementType] = useState('Bus');
    const [newElementData, setNewElementData] = useState({
        name: '',
        voltageLevel: 110,
        capacity: 100,
        demand: 50,
    });
    const [selectedNodes, setSelectedNodes] = useState([]);

    const handleAddElement = async () => {
        try {
            const elementData = {
                type: newElementType,
                name: newElementData.name || `New ${newElementType}`,
                properties: {},
            };

            // Add type-specific properties
            switch (newElementType) {
                case 'Bus':
                    elementData.properties.voltageLevel = newElementData.voltageLevel;
                    break;
                case 'Generator':
                    elementData.properties.capacity = newElementData.capacity;
                    elementData.properties.output = 0;
                    break;
                case 'Load':
                    elementData.properties.demand = newElementData.demand;
                    elementData.properties.priority = 'medium';
                    break;
            }

            const response = await api.post('/api/elements', elementData);
            const newElement = response.data.element;

            // Add to Cytoscape
            cy.add({
                group: 'nodes',
                data: {
                    id: newElement.id,
                    label: newElement.name,
                    type: newElementType,
                    ...newElement,
                },
                position: { x: 300, y: 300 }, // Default position
            });

            onElementAdded?.(newElement);
            onClose();

            toast({
                title: 'Element added',
                description: `${newElementType} "${newElement.name}" has been added`,
                status: 'success',
                duration: 3000,
            });

            // Reset form
            setNewElementData({
                name: '',
                voltageLevel: 110,
                capacity: 100,
                demand: 50,
            });
        } catch (error) {
            toast({
                title: 'Failed to add element',
                description: error.response?.data?.error || 'An error occurred',
                status: 'error',
                duration: 5000,
            });
        }
    };

    const handleDeleteSelected = async () => {
        const selected = cy.$(':selected');
        if (selected.length === 0) {
            toast({
                title: 'No elements selected',
                description: 'Please select elements to delete',
                status: 'warning',
                duration: 3000,
            });
            return;
        }

        try {
            // Delete each selected element
            for (const element of selected) {
                if (element.isNode()) {
                    await api.delete(`/api/elements/${element.id()}`);
                    element.remove();
                } else if (element.isEdge()) {
                    await api.delete(`/api/topology/connections/${element.id()}`);
                    element.remove();
                }
            }

            toast({
                title: 'Elements deleted',
                description: `${selected.length} element(s) have been deleted`,
                status: 'success',
                duration: 3000,
            });
        } catch (error) {
            toast({
                title: 'Failed to delete elements',
                description: error.response?.data?.error || 'An error occurred',
                status: 'error',
                duration: 5000,
            });
        }
    };

    const handleCreateConnection = async () => {
        const selected = cy.$('node:selected');
        if (selected.length !== 2) {
            toast({
                title: 'Select two nodes',
                description: 'Please select exactly two nodes to connect',
                status: 'warning',
                duration: 3000,
            });
            return;
        }

        const sourceId = selected[0].id();
        const targetId = selected[1].id();

        try {
            const response = await api.post('/api/topology/connections', {
                sourceId,
                targetId,
                type: 'Line',
                properties: {
                    capacity: 100,
                    resistance: 0.01,
                    reactance: 0.05,
                },
            });

            const connection = response.data.connection;

            // Add edge to Cytoscape
            cy.add({
                group: 'edges',
                data: {
                    id: connection.id,
                    source: sourceId,
                    target: targetId,
                    label: connection.name,
                },
            });

            toast({
                title: 'Connection created',
                description: `Connected ${sourceId} to ${targetId}`,
                status: 'success',
                duration: 3000,
            });
        } catch (error) {
            toast({
                title: 'Failed to create connection',
                description: error.response?.data?.error || 'An error occurred',
                status: 'error',
                duration: 5000,
            });
        }
    };

    return (
        <>
            <VStack align="stretch" spacing={2} p={4} borderRight="1px" borderColor="gray.200" bg="white">
                <Text fontWeight="bold" fontSize="sm">Edit Tools</Text>

                <ButtonGroup size="sm" orientation="vertical" variant="ghost" spacing={1}>
                    <Menu>
                        <MenuButton as={Button} leftIcon={<Plus size={16} />} justifyContent="flex-start">
                            Add Element
                        </MenuButton>
                        <MenuList>
                            <MenuItem onClick={() => { setNewElementType('Bus'); onOpen(); }}>
                                Bus
                            </MenuItem>
                            <MenuItem onClick={() => { setNewElementType('Generator'); onOpen(); }}>
                                Generator
                            </MenuItem>
                            <MenuItem onClick={() => { setNewElementType('Load'); onOpen(); }}>
                                Load
                            </MenuItem>
                            <MenuItem onClick={() => { setNewElementType('Transformer'); onOpen(); }}>
                                Transformer
                            </MenuItem>
                        </MenuList>
                    </Menu>

                    <Button leftIcon={<Link2 size={16} />} onClick={handleCreateConnection} justifyContent="flex-start">
                        Connect Nodes
                    </Button>

                    <Button leftIcon={<Unlink size={16} />} justifyContent="flex-start" isDisabled>
                        Disconnect
                    </Button>

                    <Divider />

                    <Button
                        leftIcon={<Trash2 size={16} />}
                        onClick={handleDeleteSelected}
                        colorScheme="red"
                        variant="ghost"
                        justifyContent="flex-start"
                    >
                        Delete Selected
                    </Button>
                </ButtonGroup>
            </VStack>

            {/* Add Element Modal */}
            <Modal isOpen={isOpen} onClose={onClose}>
                <ModalOverlay />
                <ModalContent>
                    <ModalHeader>Add {newElementType}</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody>
                        <VStack spacing={4}>
                            <FormControl>
                                <FormLabel>Name</FormLabel>
                                <Input
                                    value={newElementData.name}
                                    onChange={(e) => setNewElementData({ ...newElementData, name: e.target.value })}
                                    placeholder={`Enter ${newElementType.toLowerCase()} name`}
                                />
                            </FormControl>

                            {newElementType === 'Bus' && (
                                <FormControl>
                                    <FormLabel>Voltage Level (kV)</FormLabel>
                                    <NumberInput
                                        value={newElementData.voltageLevel}
                                        onChange={(value) => setNewElementData({ ...newElementData, voltageLevel: parseFloat(value) })}
                                    >
                                        <NumberInputField />
                                    </NumberInput>
                                </FormControl>
                            )}

                            {newElementType === 'Generator' && (
                                <FormControl>
                                    <FormLabel>Capacity (MW)</FormLabel>
                                    <NumberInput
                                        value={newElementData.capacity}
                                        onChange={(value) => setNewElementData({ ...newElementData, capacity: parseFloat(value) })}
                                    >
                                        <NumberInputField />
                                    </NumberInput>
                                </FormControl>
                            )}

                            {newElementType === 'Load' && (
                                <FormControl>
                                    <FormLabel>Demand (MW)</FormLabel>
                                    <NumberInput
                                        value={newElementData.demand}
                                        onChange={(value) => setNewElementData({ ...newElementData, demand: parseFloat(value) })}
                                    >
                                        <NumberInputField />
                                    </NumberInput>
                                </FormControl>
                            )}
                        </VStack>
                    </ModalBody>

                    <ModalFooter>
                        <Button variant="ghost" mr={3} onClick={onClose}>
                            Cancel
                        </Button>
                        <Button colorScheme="blue" onClick={handleAddElement}>
                            Add {newElementType}
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </>
    );
}