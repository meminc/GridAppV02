import { Box, Flex } from '@chakra-ui/react';
import Header from './Header';
import Sidebar from './Sidebar';

export default function MainLayout({ children }) {
    return (
        <Flex h="100vh" flexDirection="column">
            <Header />
            <Flex flex="1" overflow="hidden">
                <Sidebar />
                <Box flex="1" overflow="auto" bg="gray.50">
                    {children}
                </Box>
            </Flex>
        </Flex>
    );
}